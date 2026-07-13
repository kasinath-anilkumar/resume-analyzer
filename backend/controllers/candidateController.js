const crypto = require('crypto');
const CandidateRepo = require('../models/candidateRepo');
const JobRepo = require('../models/jobRepo');
const SettingsRepo = require('../models/settingsRepo');
const ParserService = require('../services/parserService');
const AIService = require('../services/aiService');
const StorageService = require('../services/storageService');

// Resolve the AI provider/key configured through Settings so resume analysis
// uses whatever key the admin pasted in the UI (auto-detected provider).
const resolveAiConfig = async () => {
  try {
    const s = await SettingsRepo.get();
    return { apiKey: s.aiApiKey, provider: s.aiProvider };
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

    // 2. Extract text straight from the in-memory buffer (no temp file)
    let extractedText;
    try {
      extractedText = await ParserService.extractText(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
    } catch (parseErr) {
      return res.status(422).json({ success: false, message: `Failed to extract text: ${parseErr.message}` });
    }

    // 3. AI analysis — REQUIRES a valid, working provider key (no mock fallback).
    const aiConfig = await resolveAiConfig();
    let aiParsedResult;
    try {
      aiParsedResult = await AIService.analyzeResume(extractedText, job, aiConfig);
    } catch (aiErr) {
      console.error('AI analysis failed:', aiErr.message);
      return res.status(aiErr.status || 502).json({
        success: false,
        code: aiErr.code || 'AI_FAILED',
        message: aiErr.message || 'AI analysis failed. Please verify the API key in Settings.',
      });
    }

    // 4. Store the resume file (Supabase Storage, or local disk fallback)
    let stored;
    try {
      stored = await StorageService.uploadResume(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
    } catch (storageErr) {
      console.error('Resume storage failed:', storageErr.response?.data || storageErr.message);
      return res.status(502).json({ success: false, message: 'Failed to store resume file. Check storage configuration.' });
    }

    // 5. Build candidate record
    const candidateData = {
      name: aiParsedResult.name || 'Unknown Candidate',
      email: aiParsedResult.email || 'unknown@example.com',
      phone: aiParsedResult.phone || '',
      resumeUrl: stored.url,
      skills: aiParsedResult.skills || [],
      education: aiParsedResult.education || [],
      experience: aiParsedResult.experience || [],
      projects: aiParsedResult.projects || [],
      certifications: aiParsedResult.certifications || [],
      languages: aiParsedResult.languages || [],
      githubUrl: aiParsedResult.githubUrl || '',
      linkedInUrl: aiParsedResult.linkedInUrl || '',
      portfolioUrl: aiParsedResult.portfolioUrl || '',
      jobId: job._id,
      status: 'Applied',
      aiAnalysis: aiParsedResult.aiAnalysis || {},
    };

    // 6. Persist
    const candidate = await CandidateRepo.create(candidateData);

    return res.status(201).json({
      success: true,
      message: `Resume parsed and analyzed successfully (stored via ${stored.provider})`,
      data: candidate,
    });
  } catch (error) {
    console.error('Upload processing error:', error);
    return res.status(500).json({ success: false, message: 'Server error processing resume' });
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

// @desc    Get single candidate profile
// @route   GET /api/candidates/:id
// @access  Private
exports.getCandidateById = async (req, res) => {
  try {
    const candidate = await CandidateRepo.findByIdApi(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    return res.json({ success: true, data: candidate });
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

// @desc    Delete a candidate and all associated data (record, notes, resume file)
// @route   DELETE /api/candidates/:id
// @access  Private (Admin, Recruiter)
exports.deleteCandidate = async (req, res) => {
  try {
    const removed = await CandidateRepo.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    // Clear the stored resume file so nothing is orphaned (best-effort).
    await StorageService.deleteResume(removed.resumeUrl);
    return res.json({ success: true, message: 'Candidate and resume deleted', data: { _id: removed._id } });
  } catch (error) {
    console.error('Delete candidate error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting candidate' });
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
