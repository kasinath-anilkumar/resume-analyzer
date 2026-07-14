const crypto = require('crypto');
const CandidateRepo = require('../models/candidateRepo');
const JobRepo = require('../models/jobRepo');
const SettingsRepo = require('../models/settingsRepo');
const ParserService = require('../services/parserService');
const AIService = require('../services/aiService');
const StorageService = require('../services/storageService');
const EmailService = require('../services/emailService');
const AuditRepo = require('../models/auditRepo');
const ApplicantRepo = require('../models/applicantRepo');
const CandidateMatcher = require('../services/candidateMatcher');

// Resolve the AI provider/key configured through Settings so resume analysis
// uses whatever key the admin pasted in the UI (auto-detected provider).
const resolveAiConfig = async () => {
  try {
    const s = await SettingsRepo.get();
    return { apiKey: s.aiApiKey, provider: s.aiProvider, model: s.aiModel };
  } catch (err) {
    console.error('Failed to resolve AI config, using defaults', err.message);
    return {};
  }
};

// @desc    Upload and process resume
// @route   POST /api/candidates
// @access  Private (Admin, Recruiter)
exports.uploadResume = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please upload a resume file' });
    }

    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Please provide a valid jobId' });
    }

    // 1. Fetch the target job
    const job = await JobRepo.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job opening not found' });
    }

    // 2. Store the résumé file now. Parsing + AI analysis happen in the
    //    background worker so this request returns immediately (no OCR/AI/
    //    rate-limit latency on the request path).
    let stored;
    try {
      stored = await StorageService.uploadResume(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (storageErr) {
      console.error('Resume storage failed:', storageErr.response?.data || storageErr.message);
      return res.status(502).json({ success: false, message: 'Failed to store resume file. Check storage configuration.' });
    }

    // 3. Create a placeholder candidate queued for analysis. The worker fills in
    //    name/email/skills/aiAnalysis and flips analysis_status to 'completed'.
    const baseName = (req.file.originalname || 'resume').replace(/\.[^.]+$/, '').slice(0, 120) || 'New candidate';
    const candidate = await CandidateRepo.create({
      name: baseName,
      email: `pending-${Date.now()}-${Math.round(Math.random() * 1e6)}@pending.local`,
      phone: '',
      resumeUrl: stored.url,
      jobId: job._id,
      status: 'Applied',
      source: 'Manual',
      analysisStatus: 'pending',
      aiAnalysis: {},
    });

    return res.status(202).json({
      success: true,
      message: 'Résumé uploaded and queued for AI analysis.',
      data: candidate,
    });
  } catch (error) {
    console.error('Upload processing error:', error);
    return res.status(500).json({ success: false, message: 'Server error processing resume' });
  }
};

// @desc    Manually add a candidate with no résumé (details typed by a recruiter).
// @route   POST /api/candidates/manual
// @access  Private (Admin, Recruiter)
exports.createManualCandidate = async (req, res) => {
  try {
    const {
      jobId, name, email, phone, currentLocation, salaryExpectation,
      skills, linkedInUrl, portfolioUrl, githubUrl, summary, status,
    } = req.body;

    if (!jobId || !name || !email) {
      return res.status(400).json({ success: false, message: 'Name, email and a target job are required.' });
    }
    const job = await JobRepo.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Target job not found' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    try {
      if (await CandidateRepo.existsForJobEmail(job._id, cleanEmail)) {
        return res.status(409).json({ success: false, code: 'ALREADY_EXISTS', message: 'A candidate with this email already exists for this job.' });
      }
    } catch (dupErr) {
      console.error('Manual add dedup check failed:', dupErr.message);
    }

    const skillsArr = Array.isArray(skills)
      ? skills.map((s) => String(s).trim()).filter(Boolean)
      : String(skills || '').split(',').map((s) => s.trim()).filter(Boolean);

    const VALID = ['Applied', 'Screening', 'Shortlisted', 'Interview', 'Technical Round', 'HR Round', 'Offer', 'Hired', 'Rejected'];
    const initialStatus = VALID.includes(status) ? status : 'Applied';

    const candidate = await CandidateRepo.create({
      name: name.trim(),
      email: cleanEmail,
      phone: (phone || '').trim(),
      currentLocation: (currentLocation || '').trim(),
      salaryExpectation: (salaryExpectation || '').trim(),
      skills: skillsArr,
      githubUrl: (githubUrl || '').trim(),
      linkedInUrl: (linkedInUrl || '').trim(),
      portfolioUrl: (portfolioUrl || '').trim(),
      resumeUrl: null, // manually entered — no résumé on file
      jobId: job._id,
      status: initialStatus,
      source: 'Manual',
      analysisStatus: 'completed', // nothing to analyze
      aiAnalysis: summary && String(summary).trim() ? { careerSummary: String(summary).trim() } : {},
    });

    AuditRepo.log(req.user, 'candidate.create_manual', { entityType: 'candidate', entityId: candidate._id, summary: `Manually added candidate ${candidate.name}` });
    return res.status(201).json({ success: true, message: 'Candidate added.', data: candidate });
  } catch (error) {
    console.error('Manual candidate create error:', error);
    return res.status(500).json({ success: false, message: 'Server error adding candidate' });
  }
};

// @desc    Get candidates (with advanced search & filtering)
// @route   GET /api/candidates
// @access  Private
exports.getCandidates = async (req, res) => {
  try {
    const { jobId, status, minScore, search, skill } = req.query;
    const candidates = await CandidateRepo.listApi({ jobId, status, minScore, search, skill });
    return res.json({ success: true, count: candidates.length, data: candidates });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error retrieving candidates' });
  }
};

// @desc    Cross-role recommendations: rank the WHOLE candidate pool by how well
//          each fits the given job, regardless of the role they applied for.
//          Fit is computed live (deterministic matcher) so it's always fresh —
//          a new résumé or a new job shows up in recommendations immediately.
// @route   GET /api/candidates/recommendations?jobId=<id>&min=<score>
// @access  Private
exports.getRecommendations = async (req, res) => {
  try {
    const { jobId, min } = req.query;
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'A jobId is required.' });
    }
    const job = await JobRepo.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // The full pool, each with its applied job populated ({_id,title,department}).
    const pool = await CandidateRepo.listApi({});
    const minScore = Number.isFinite(+min) ? +min : 40;
    const ranked = CandidateMatcher.rankPool(pool, job, { min: minScore });

    // Lean payload for the list view.
    const data = ranked.map((c) => {
      const a = c.aiAnalysis || {};
      const applied = c.jobId && typeof c.jobId === 'object' ? { _id: c.jobId._id, title: c.jobId.title } : null;
      return {
        _id: c._id,
        name: c.name,
        email: c.email,
        status: c.status,
        analysisStatus: c.analysisStatus,
        skills: c.skills || [],
        appliedHere: c.appliedHere,
        appliedJob: applied,
        seniorityLevel: a.seniorityLevel || '',
        redFlags: a.redFlags || [],
        careerSummary: a.careerSummary || a.matchExplanation || '',
        appliedScore: Number.isFinite(a.overallScore) ? a.overallScore : null,
        match: c.match,
      };
    });

    return res.json({
      success: true,
      count: data.length,
      job: { _id: job._id, title: job.title },
      data,
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    return res.status(500).json({ success: false, message: 'Server error building recommendations' });
  }
};

// @desc    Get single candidate profile
// @route   GET /api/candidates/:id
// @access  Private
exports.getCandidateById = async (req, res) => {
  try {
    const candidate = await CandidateRepo.findByIdApi(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    // Surface other candidate records sharing this email. Distinguish a true
    // duplicate (same email, SAME job) from the person also applying elsewhere.
    let duplicates = [];
    try {
      const myJobId = candidate.jobId?._id || candidate.jobId;
      const others = await CandidateRepo.findByEmail(candidate.email, candidate._id);
      duplicates = others.map((d) => ({ ...d, sameJob: String(d.jobId) === String(myJobId) }));
    } catch (dupErr) {
      console.error('Duplicate lookup failed:', dupErr.message);
    }
    return res.json({ success: true, data: { ...candidate, duplicates } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error retrieving candidate profile' });
  }
};

// @desc    Update candidate pipeline status (for Kanban drag & drop)
// @route   PUT /api/candidates/:id/status
// @access  Private (Admin, Recruiter)
exports.updateCandidateStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = [
      'Applied', 'Screening', 'Shortlisted', 'Interview',
      'Technical Round', 'HR Round', 'Offer', 'Hired', 'Rejected',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid pipeline status' });
    }

    const candidate = await CandidateRepo.updateStatus(req.params.id, status);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    AuditRepo.log(req.user, 'candidate.status_change', { entityType: 'candidate', entityId: req.params.id, summary: `${candidate.name} → ${status}` });
    return res.json({ success: true, data: candidate });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error updating status' });
  }
};

// @desc    Add Recruiter Note
// @route   POST /api/candidates/:id/notes
// @access  Private
exports.addNote = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }

    const candidate = await CandidateRepo.getRaw(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const newNote = {
      _id: crypto.randomUUID(),
      note,
      author: { _id: req.user.id, name: req.user.name, role: req.user.role },
      createdAt: new Date().toISOString(),
    };
    const notes = [...(candidate.notes || []), newNote];
    const saved = await CandidateRepo.setNotes(req.params.id, notes);

    return res.status(201).json({ success: true, data: saved });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error adding note' });
  }
};

// @desc    Delete Recruiter Note
// @route   DELETE /api/candidates/:id/notes/:noteId
// @access  Private
exports.deleteNote = async (req, res) => {
  try {
    const candidate = await CandidateRepo.getRaw(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const notes = candidate.notes || [];
    const note = notes.find((n) => String(n._id) === String(req.params.noteId));
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    // Authorization: only the note's author or an Admin may delete it.
    const authorId = note.author && (note.author._id || note.author);
    if (String(authorId) !== String(req.user.id) && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this note' });
    }

    const remaining = notes.filter((n) => String(n._id) !== String(req.params.noteId));
    const saved = await CandidateRepo.setNotes(req.params.id, remaining);

    return res.json({ success: true, data: saved });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error deleting note' });
  }
};

// @desc    Schedule an interview for a candidate
// @route   POST /api/candidates/:id/interviews
// @access  Private (Admin, Recruiter)
exports.scheduleInterview = async (req, res) => {
  try {
    const { stage, scheduledAt, mode, locationOrLink, interviewer, notes, notifyCandidate } = req.body;
    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: 'A date/time is required.' });
    }

    const candidate = await CandidateRepo.getRaw(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const interview = {
      _id: crypto.randomUUID(),
      stage: stage || 'Interview',
      scheduledAt,
      mode: mode || 'Online',
      locationOrLink: locationOrLink || '',
      interviewer: interviewer || '',
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };
    const interviews = [...(candidate.interviews || []), interview].sort(
      (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
    );
    const saved = await CandidateRepo.setInterviews(req.params.id, interviews);

    // Optionally email the candidate their invite (best-effort).
    let emailed = false;
    if (notifyCandidate && EmailService.isConfigured()) {
      const job = await JobRepo.findById(candidate.job_id);
      const result = await EmailService.sendInterviewInvite(
        { name: candidate.name, email: candidate.email },
        interview,
        job?.title
      );
      emailed = result.sent;
    }

    return res.status(201).json({ success: true, data: saved, emailed });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error scheduling interview' });
  }
};

// @desc    Remove a scheduled interview
// @route   DELETE /api/candidates/:id/interviews/:interviewId
// @access  Private (Admin, Recruiter)
exports.deleteInterview = async (req, res) => {
  try {
    const candidate = await CandidateRepo.getRaw(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    const interviews = (candidate.interviews || []).filter(
      (iv) => String(iv._id) !== String(req.params.interviewId)
    );
    const saved = await CandidateRepo.setInterviews(req.params.id, interviews);
    return res.json({ success: true, data: saved });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error removing interview' });
  }
};

// @desc    Move a candidate to a different job opening
// @route   PUT /api/candidates/:id/job
// @access  Private (Admin, Recruiter)
exports.moveCandidateJob = async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'A target jobId is required.' });
    }
    const job = await JobRepo.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Target job not found' });
    }
    const candidate = await CandidateRepo.moveJob(req.params.id, jobId);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    AuditRepo.log(req.user, 'candidate.move_job', { entityType: 'candidate', entityId: req.params.id, summary: `Moved ${candidate.name} to ${job.title}` });
    return res.json({
      success: true,
      data: candidate,
      // Scores are job-specific — hint that a re-analysis is advisable.
      message: 'Candidate moved. AI scores reflect the previous job — consider re-running analysis.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error moving candidate' });
  }
};

// @desc    Re-run AI analysis for a candidate against their current job
// @route   POST /api/candidates/:id/reanalyze
// @access  Private (Admin, Recruiter)
exports.reanalyzeCandidate = async (req, res) => {
  try {
    const candidate = await CandidateRepo.getRaw(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    if (!candidate.resume_url) {
      return res.status(400).json({ success: false, message: 'This candidate was added manually and has no résumé to analyze.' });
    }
    const job = await JobRepo.findById(candidate.job_id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Candidate job not found' });
    }

    // 1. Pull the stored resume back into memory and re-extract its text.
    let extractedText;
    try {
      const file = await StorageService.downloadResume(candidate.resume_url);
      extractedText = await ParserService.extractText(file.buffer, file.mimeType, file.originalName);
    } catch (dlErr) {
      console.error('Re-analyze download/parse failed:', dlErr.message);
      return res.status(502).json({ success: false, message: 'Could not read the stored resume to re-analyze.' });
    }

    // 2. Re-run AI analysis against the current job.
    const aiConfig = await resolveAiConfig();
    let parsed;
    try {
      parsed = await AIService.analyzeResume(extractedText, job, aiConfig);
    } catch (aiErr) {
      return res.status(aiErr.status || 502).json({
        success: false,
        code: aiErr.code || 'AI_FAILED',
        message: aiErr.message || 'AI re-analysis failed. Verify the API key in Settings.',
      });
    }

    // 3. Persist the refreshed AI fields.
    const updated = await CandidateRepo.applyReanalysis(req.params.id, parsed);
    return res.json({ success: true, data: updated, message: 'Candidate re-analyzed against the current job.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error re-analyzing candidate' });
  }
};

// @desc    Export all stored data for a candidate (GDPR subject-access request)
// @route   GET /api/candidates/:id/export
// @access  Private (Admin, Recruiter)
exports.exportCandidate = async (req, res) => {
  try {
    const candidate = await CandidateRepo.findByIdApi(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    const filename = `candidate-${String(candidate.name || 'export').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${candidate._id}.json`;
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.email || req.user?.id,
      candidate,
    };
    AuditRepo.log(req.user, 'candidate.export', { entityType: 'candidate', entityId: candidate._id, summary: `Exported data for ${candidate.name}` });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Export candidate error:', error);
    return res.status(500).json({ success: false, message: 'Server error exporting candidate data' });
  }
};

// @desc    Delete a candidate and all associated data (record, notes, resume file)
// @route   DELETE /api/candidates/:id
// @access  Private (Admin, Recruiter)
// Soft delete → moves the candidate to Trash (recoverable). The résumé file is
// kept so a restore is lossless; trashed rows are auto-purged after 30 days.
exports.deleteCandidate = async (req, res) => {
  try {
    const trashed = await CandidateRepo.softDelete(req.params.id);
    if (!trashed) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    AuditRepo.log(req.user, 'candidate.delete', { entityType: 'candidate', entityId: trashed._id, summary: `Moved candidate ${trashed.name || trashed._id} to Trash` });
    return res.json({ success: true, message: 'Candidate moved to Trash. You can restore it within 30 days.', data: { _id: trashed._id } });
  } catch (error) {
    console.error('Delete candidate error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting candidate' });
  }
};

// @desc    List trashed candidates
// @route   GET /api/candidates/trash
// @access  Private (Admin, Recruiter)
exports.getTrash = async (req, res) => {
  try {
    const rows = await CandidateRepo.listTrash();
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('Trash list error:', error);
    return res.status(500).json({ success: false, message: 'Server error loading trash' });
  }
};

// @desc    Restore a trashed candidate
// @route   POST /api/candidates/:id/restore
// @access  Private (Admin, Recruiter)
exports.restoreCandidate = async (req, res) => {
  try {
    const restored = await CandidateRepo.restore(req.params.id);
    if (!restored) {
      return res.status(404).json({ success: false, message: 'Trashed candidate not found' });
    }
    AuditRepo.log(req.user, 'candidate.restore', { entityType: 'candidate', entityId: restored._id, summary: `Restored candidate ${restored.name || restored._id}` });
    return res.json({ success: true, message: 'Candidate restored.', data: { _id: restored._id } });
  } catch (error) {
    console.error('Restore candidate error:', error);
    return res.status(500).json({ success: false, message: 'Server error restoring candidate' });
  }
};

// @desc    Permanently delete a candidate (from Trash) + its résumé file
// @route   DELETE /api/candidates/:id/permanent
// @access  Private (Admin, Recruiter)
exports.permanentDeleteCandidate = async (req, res) => {
  try {
    const removed = await CandidateRepo.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    await StorageService.deleteResume(removed.resumeUrl);
    AuditRepo.log(req.user, 'candidate.delete_permanent', { entityType: 'candidate', entityId: removed._id, summary: `Permanently deleted candidate ${removed._id}` });
    return res.json({ success: true, message: 'Candidate permanently deleted.', data: { _id: removed._id } });
  } catch (error) {
    console.error('Permanent delete error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting candidate' });
  }
};

// @desc    GDPR erasure — delete the WHOLE person: their portal account + every
//          application (candidate row) with their email + all résumé files.
// @route   DELETE /api/candidates/:id/person
// @access  Private (Admin, Recruiter)
exports.deletePerson = async (req, res) => {
  try {
    const cand = await CandidateRepo.getRaw(req.params.id);
    if (!cand) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    const email = String(cand.email || '').toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'This candidate has no email to identify the person.' });
    }

    // 1. Delete every application for this email + their résumé files.
    const removedCandidates = await CandidateRepo.hardDeleteAllForEmail(email);
    for (const r of removedCandidates) await StorageService.deleteResume(r.resumeUrl).catch(() => {});

    // 2. Delete the portal account + its saved primary résumé, if any.
    let account = null;
    try {
      account = await ApplicantRepo.deleteByEmail(email);
      if (account?.resumeUrl) await StorageService.deleteResume(account.resumeUrl).catch(() => {});
    } catch (accErr) {
      console.error('GDPR account delete failed:', accErr.message);
    }

    AuditRepo.log(req.user, 'candidate.delete_person', {
      entityType: 'candidate',
      entityId: req.params.id,
      summary: `GDPR erase: ${email} — ${removedCandidates.length} application(s)${account ? ' + portal account' : ''}`,
    });
    return res.json({
      success: true,
      message: `Erased all data for ${email}: ${removedCandidates.length} application(s)${account ? ' and their portal account' : ''}.`,
      data: { email, applicationsDeleted: removedCandidates.length, accountDeleted: Boolean(account) },
    });
  } catch (error) {
    console.error('GDPR delete person error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting person' });
  }
};

// @desc    Get dashboard metrics & chart data
// @route   GET /api/candidates/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const jobs = await JobRepo.list({}); // excludes Archived
    const candidates = await CandidateRepo.allForStats();

    const totalJobs = jobs.length;
    const activeJobs = jobs.filter((j) => j.status === 'Active').length;
    const totalCandidates = candidates.length;
    const shortlistedCount = candidates.filter((c) => c.status === 'Shortlisted').length;
    const rejectedCount = candidates.filter((c) => c.status === 'Rejected').length;
    const hiredCount = candidates.filter((c) => c.status === 'Hired').length;
    const interviewCount = candidates.filter((c) =>
      ['Interview', 'Technical Round', 'HR Round'].includes(c.status)
    ).length;
    // Candidates that reached the shortlist stage OR advanced past it. A candidate
    // who was shortlisted and later moved to Interview/HR/Hired is no longer in the
    // 'Shortlisted' status, so a plain status===Shortlisted count understates the
    // real shortlist rate. This cumulative count is what the "shortlist rate" uses.
    const shortlistedReached = candidates.filter((c) =>
      ['Shortlisted', 'Interview', 'Technical Round', 'HR Round', 'Offer', 'Hired'].includes(c.status)
    ).length;

    const pipelineStages = [
      'Applied', 'Screening', 'Shortlisted', 'Interview',
      'Technical Round', 'HR Round', 'Offer', 'Hired', 'Rejected',
    ];
    const funnelData = pipelineStages.map((stage) => ({
      name: stage,
      value: candidates.filter((c) => c.status === stage).length,
    }));

    const applicationsPerJob = jobs.slice(0, 5).map((job) => ({
      name: job.title,
      count: candidates.filter((c) => String(c.jobId) === String(job._id)).length,
    }));

    const statusDistribution = [
      { name: 'Applied/Screening', value: candidates.filter((c) => ['Applied', 'Screening'].includes(c.status)).length },
      { name: 'Shortlisted', value: shortlistedCount },
      { name: 'Interviews Active', value: interviewCount },
      { name: 'Offers/Hired', value: candidates.filter((c) => ['Offer', 'Hired'].includes(c.status)).length },
      { name: 'Rejected', value: rejectedCount },
    ];

    // Top skills
    const skillCounts = {};
    candidates.forEach((cand) => {
      (cand.skills || []).forEach((skill) => {
        const clean = String(skill).trim();
        if (clean) skillCounts[clean] = (skillCounts[clean] || 0) + 1;
      });
    });
    const skillDistribution = Object.entries(skillCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Monthly hiring activity over the past 6 months
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyActivity = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const monthNum = date.getMonth();
      const startOfMonth = new Date(year, monthNum, 1);
      const endOfMonth = new Date(year, monthNum + 1, 0, 23, 59, 59);

      const appCount = candidates.filter((c) => {
        const t = c.createdAt ? new Date(c.createdAt) : null;
        return t && t >= startOfMonth && t <= endOfMonth;
      }).length;
      const hireCount = candidates.filter((c) => {
        if (c.status !== 'Hired') return false;
        const t = c.updatedAt ? new Date(c.updatedAt) : null;
        return t && t >= startOfMonth && t <= endOfMonth;
      }).length;

      monthlyActivity.push({
        month: `${months[monthNum]} ${year.toString().slice(-2)}`,
        Applications: appCount,
        Hired: hireCount,
      });
    }

    return res.json({
      success: true,
      data: {
        kpis: {
          totalJobs,
          activeJobs,
          totalCandidates,
          shortlistedCount,
          shortlistedReached,
          rejectedCount,
          hiredCount,
          interviewCount,
        },
        funnelData,
        applicationsPerJob,
        statusDistribution,
        skillDistribution,
        monthlyActivity,
      },
    });
  } catch (error) {
    console.error('Stats aggregation error:', error);
    return res.status(500).json({ success: false, message: 'Server error aggregating stats' });
  }
};
