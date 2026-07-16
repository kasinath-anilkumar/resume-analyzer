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
const EmbeddingService = require('../services/embeddingService');
const WhatsApp = require('../services/whatsappService');
const LeadIngestion = require('../services/leadIngestion');
const { getOrCompute } = require('../utils/ttlCache');
const { geocodeOne, peek, warm, distanceKm } = require('../utils/geocode');

// How strongly embedding similarity blends into the deterministic fit score when
// semantic matching is available (0 = keyword-only, 1 = embedding-only).
const SEMANTIC_WEIGHT = 0.4;

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
// Derive the résumé-flow status of a lead from its raw fields.
const deriveLeadStatus = (r) => {
  if (!r.hasResume) return r.resumeRequestedAt ? 'awaiting' : 'no_request';
  if (r.analysisStatus === 'pending' || r.analysisStatus === 'processing') return 'analyzing';
  if (r.analysisStatus === 'failed') return 'failed';
  return 'analyzed';
};

// @desc    List automation leads (Meta Ads + sheet import) with résumé-flow status
// @route   GET /api/candidates/leads
// @access  Private (Admin, Recruiter)
exports.getLeads = async (req, res) => {
  try {
    const { jobId, source, status, search, page, pageSize } = req.query;
    const [pageRes, stats] = await Promise.all([
      CandidateRepo.listLeadsPaged({ jobId, source, leadStatus: status, search, page, pageSize }),
      CandidateRepo.leadStats(jobId),
    ]);
    const data = pageRes.rows.map((r) => ({ ...r, leadStatus: deriveLeadStatus(r) }));
    return res.json({
      success: true,
      count: data.length,
      total: pageRes.total,
      page: pageRes.page,
      pageSize: pageRes.pageSize,
      stats,
      data,
    });
  } catch (error) {
    console.error('Get leads error:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving leads' });
  }
};

// @desc    (Re)send the WhatsApp résumé request for a lead still awaiting a résumé
// @route   POST /api/candidates/:id/resend-request
// @access  Private (Admin, Recruiter)
exports.resendResumeRequest = async (req, res) => {
  try {
    const lead = await CandidateRepo.findLeadForResend(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (lead.resumeUrl) return res.status(400).json({ success: false, message: 'This lead already has a résumé.' });
    if (!lead.phone) return res.status(400).json({ success: false, message: 'No phone number on file for this lead.' });

    const settings = await SettingsRepo.get();
    if (!WhatsApp.isConfigured(settings)) {
      return res.status(400).json({ success: false, message: 'WhatsApp isn’t configured yet (Settings → Integrations).' });
    }
    let jobTitle = 'the role';
    try { const job = await JobRepo.findById(lead.jobId); if (job) jobTitle = job.title; } catch (_) { /* non-fatal */ }

    const uploadUrl = `${LeadIngestion._appBaseUrl()}/u/${lead.resumeUploadToken}`;
    const wa = await WhatsApp.sendResumeRequest(settings, { toPhone: lead.phone, name: lead.name, jobTitle, uploadUrl });
    if (!wa.sent) {
      return res.status(502).json({ success: false, message: wa.error || 'WhatsApp did not accept the message.' });
    }
    await CandidateRepo.markResumeRequested(lead._id).catch(() => {});
    AuditRepo.log(req.user, 'lead.resend_request', {
      entityType: 'candidate', entityId: lead._id,
      summary: `Re-sent résumé request to ${lead.name || 'lead'}`,
    });
    return res.json({ success: true, message: 'Résumé request sent.' });
  } catch (error) {
    console.error('Resend request error:', error);
    return res.status(500).json({ success: false, message: 'Server error sending the request.' });
  }
};

// @desc    Bulk-send the WhatsApp résumé request to every lead awaiting a résumé
// @route   POST /api/candidates/leads/send-requests   body: { jobId? }
// @access  Private (Admin, Recruiter)
exports.sendLeadRequests = async (req, res) => {
  try {
    const { jobId } = req.body || {};
    const settings = await SettingsRepo.get();
    if (!WhatsApp.isConfigured(settings)) {
      return res.status(400).json({ success: false, message: 'WhatsApp isn’t configured yet (Settings → Integrations).' });
    }
    const leads = await CandidateRepo.listLeadsAwaitingResume(jobId);
    if (!leads.length) return res.json({ success: true, queued: 0, message: 'No leads are awaiting a résumé request.' });

    // Ack immediately, then send in the background: a big batch would blow the
    // request timeout, and WhatsApp needs gentle pacing anyway.
    res.json({ success: true, queued: leads.length, message: `Sending résumé requests to ${leads.length} lead(s) in the background. Refresh in a moment to see progress.` });

    const actor = req.user;
    (async () => {
      const appBaseUrl = LeadIngestion._appBaseUrl();
      const titleCache = {};
      let sent = 0;
      for (const l of leads) {
        try {
          if (titleCache[l.jobId] === undefined) {
            const j = await JobRepo.findById(l.jobId);
            titleCache[l.jobId] = (j && j.title) || 'the role';
          }
          const wa = await WhatsApp.sendResumeRequest(settings, {
            toPhone: l.phone, name: l.name, jobTitle: titleCache[l.jobId],
            uploadUrl: `${appBaseUrl}/u/${l.resumeUploadToken}`,
          });
          if (wa.sent) { sent += 1; await CandidateRepo.markResumeRequested(l._id).catch(() => {}); }
          await new Promise((r) => setTimeout(r, 120)); // gentle pacing between sends
        } catch (_) { /* one failure shouldn't stop the batch */ }
      }
      AuditRepo.log(actor, 'lead.bulk_request', { entityType: 'settings', summary: `Bulk résumé requests: sent ${sent}/${leads.length}` });
    })().catch(() => {});
  } catch (error) {
    console.error('Bulk send error:', error);
    return res.status(500).json({ success: false, message: 'Server error sending requests.' });
  }
};

// @desc    Exact per-stage candidate counts for a job (pipeline board badges)
// @route   GET /api/candidates/pipeline-counts?jobId=...
// @access  Private
exports.getPipelineCounts = async (req, res) => {
  try {
    const { jobId } = req.query;
    if (!jobId) return res.json({ success: true, data: {} });
    const stages = ['Applied', 'Screening', 'Shortlisted', 'Interview', 'Technical Round', 'HR Round', 'Offer', 'Hired', 'Rejected'];
    const data = await CandidateRepo.stageCountsForJob(jobId, stages);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Pipeline counts error:', error);
    return res.status(500).json({ success: false, message: 'Server error loading pipeline counts' });
  }
};

exports.getCandidates = async (req, res) => {
  try {
    const { jobId, status, minScore, search, skill, verdict, page, pageSize, sort, radiusKm } = req.query;
    const filters = { jobId, status, minScore, search, skill, verdict };

    // Distance sort/radius filter — reference is the SELECTED JOB's location, and
    // ranking must span the WHOLE matching set, so it takes a dedicated path.
    if (sort === 'distance_nearest' || sort === 'distance_farthest') {
      return await getCandidatesByDistance(res, { filters, sort, radiusKm, page, pageSize });
    }

    // SQL-side filtered pagination — never loads the whole table into memory.
    const result = await CandidateRepo.listApiPaged({ ...filters, page, pageSize });
    return res.json({
      success: true,
      count: result.rows.length,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error retrieving candidates' });
  }
};

// Distance path: measure each candidate's location against the selected job's
// location (geocoded), rank the full matching set, then paginate + hydrate only
// the page. Candidates whose location can't be geocoded sort last (and are
// excluded when a radius is set). Bounded: distance always implies a selected
// job, so the matching set is that job's applicants.
async function getCandidatesByDistance(res, { filters, sort, radiusKm, page, pageSize }) {
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 500);

  const unavailable = async (reason) => {
    const result = await CandidateRepo.listApiPaged({ ...filters, page, pageSize });
    return res.json({
      success: true,
      count: result.rows.length,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      data: result.rows,
      distance: { available: false, reason },
    });
  };

  if (!filters.jobId) {
    return res.status(400).json({ success: false, message: 'Select a job to sort candidates by distance from its location.' });
  }
  const job = await JobRepo.findById(filters.jobId);
  if (!job) return unavailable('Job not found.');

  // Resolve the reference (the job's location) now — one geocode, then cached.
  // peek() avoids a network call once it's known; geocodeOne() resolves a miss.
  let ref = peek(job.location);
  if (ref === undefined) ref = await geocodeOne(job.location);
  if (!ref) {
    // null → searched, no coordinates. undefined → transient lookup failure.
    return unavailable(
      ref === undefined
        ? 'Location lookup is temporarily unavailable — please try again in a moment.'
        : `Couldn't find coordinates for the job location "${job.location}", so distance sorting is unavailable.`
    );
  }

  const { rows, capped } = await CandidateRepo.searchAllMatching(filters, 3000);
  const radius = radiusKm ? parseInt(radiusKm, 10) : null;

  // Kick off background resolution of any candidate locations we haven't cached
  // yet (throttled), then compute distance from whatever's already resolved.
  warm(rows.map((c) => c.currentLocation).filter(Boolean));
  let warming = 0; // still being looked up — will appear on a later refresh
  let withDist = rows.map((c) => {
    const cc = c.currentLocation ? peek(c.currentLocation) : null;
    if (cc === undefined) warming += 1;
    return { ...c, distanceKm: cc && cc.lat != null ? distanceKm(ref, cc) : null };
  });

  if (radius && radius > 0) {
    withDist = withDist.filter((c) => c.distanceKm != null && c.distanceKm <= radius);
  }

  const dir = sort === 'distance_farthest' ? -1 : 1;
  withDist.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;   // unknown location → always last
    if (b.distanceKm == null) return -1;
    return (a.distanceKm - b.distanceKm) * dir;
  });

  const total = withDist.length;
  const pageSlice = withDist.slice((pg - 1) * size, (pg - 1) * size + size);
  const hydrated = await CandidateRepo.hydrateRows(pageSlice); // keeps distanceKm

  return res.json({
    success: true,
    count: hydrated.length,
    total,
    page: pg,
    pageSize: size,
    data: hydrated,
    distance: { available: true, reference: job.location, radiusKm: radius || null, capped, warming },
  });
}

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

    const minScore = Number.isFinite(+min) ? +min : 40;
    let pool = null;
    let semanticWeight = 0;
    let semanticActive = false;

    // --- Semantic path (pgvector, BOUNDED) ----------------------------------
    // Resolve the job embedding (embedding it on-demand + caching). Then, instead
    // of loading the WHOLE pool + every embedding into Node, ask Postgres (via the
    // HNSW index) for only the top-K candidates nearest to the job — UNION this
    // job's own applicants (who must always appear). Self-disabling: any failure
    // or an unconfigured provider falls back to the deterministic full-pool path.
    try {
      if (await EmbeddingService.isAvailable()) {
        let jobEmb = await JobRepo.getEmbedding(job._id);
        if (!jobEmb) {
          const fresh = await EmbeddingService.embedJob(job);
          if (fresh) {
            await JobRepo.setEmbedding(job._id, fresh.vector, fresh.model);
            jobEmb = { embedding: fresh.vector, embeddingModel: fresh.model };
          }
        }
        if (jobEmb && Array.isArray(jobEmb.embedding)) {
          job.embedding = jobEmb.embedding;
          job.embeddingModel = jobEmb.embeddingModel;
          const matched = await CandidateRepo.matchByEmbedding(jobEmb.embedding, 250); // top-K nearest
          const applicants = await CandidateRepo.listForJob(job._id);                  // always include
          const byId = new Map();
          matched.forEach(({ candidate, similarity }) => {
            candidate.semanticSim = similarity; // pgvector-computed cosine (skip JS recompute)
            byId.set(candidate._id, candidate);
          });
          applicants.forEach((c) => { if (!byId.has(c._id)) byId.set(c._id, c); });
          pool = await CandidateRepo.populateAppliedJobs([...byId.values()]);
          semanticWeight = SEMANTIC_WEIGHT;
          semanticActive = true;
        }
      }
    } catch (semErr) {
      console.error('pgvector recommendation path skipped:', semErr.message);
      pool = null;
      semanticWeight = 0;
      semanticActive = false;
    }

    // Fallback: deterministic keyword ranking over the full pool (semantic off or
    // pgvector unavailable). listApi already populates each candidate's applied job.
    if (!pool) {
      pool = await CandidateRepo.listApi({});
    }

    const ranked = CandidateMatcher.rankPool(pool, job, { min: minScore, semanticWeight });

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
      semantic: semanticActive, // true when embedding similarity blended into scores
      data,
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    return res.status(500).json({ success: false, message: 'Server error building recommendations' });
  }
};

// @desc    Backfill embeddings for candidates + jobs that lack them, so semantic
//          matching lights up for existing data (new rows get embedded live).
// @route   POST /api/candidates/embeddings/backfill
// @access  Private (Admin)
exports.backfillEmbeddings = async (req, res) => {
  try {
    if (!(await EmbeddingService.isAvailable())) {
      return res.status(400).json({
        success: false,
        message: 'Semantic matching is unavailable — configure an AI provider key in Settings first.',
      });
    }
    const [cands, jobs] = await Promise.all([
      CandidateRepo.listNeedingEmbedding(500),
      JobRepo.listNeedingEmbedding(200),
    ]);

    let candidatesEmbedded = 0;
    for (const c of cands) {
      try {
        const emb = await EmbeddingService.embedCandidate(c);
        if (emb) { await CandidateRepo.setEmbedding(c._id, emb.vector, emb.model); candidatesEmbedded += 1; }
      } catch (e) { console.error('backfill candidate failed', c._id, e.message); }
    }
    let jobsEmbedded = 0;
    for (const j of jobs) {
      try {
        const emb = await EmbeddingService.embedJob(j);
        if (emb) { await JobRepo.setEmbedding(j._id, emb.vector, emb.model); jobsEmbedded += 1; }
      } catch (e) { console.error('backfill job failed', j._id, e.message); }
    }

    AuditRepo.log(req.user, 'embeddings.backfill', {
      entityType: 'settings', summary: `Embedded ${candidatesEmbedded} candidate(s) + ${jobsEmbedded} job(s)`,
    });
    return res.json({
      success: true,
      message: `Semantic matching updated: embedded ${candidatesEmbedded} candidate(s) and ${jobsEmbedded} job(s).`,
      candidatesEmbedded, jobsEmbedded,
      candidatesRemaining: cands.length - candidatesEmbedded,
    });
  } catch (error) {
    console.error('Backfill embeddings error:', error);
    return res.status(500).json({ success: false, message: 'Server error backfilling embeddings' });
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

// @desc    Mint a short-lived signed URL to view/download a candidate's résumé.
//          Résumés live in a private bucket; this is the only way to reach one,
//          and it's gated behind recruiter auth (the caller already passed
//          `protect`). The URL expires quickly so it isn't a durable capability.
// @route   GET /api/candidates/:id/resume-url
// @access  Private
exports.getResumeSignedUrl = async (req, res) => {
  try {
    const candidate = await CandidateRepo.findByIdApi(req.params.id);
    if (!candidate || !candidate.resumeUrl) {
      return res.status(404).json({ success: false, message: 'No résumé on file for this candidate.' });
    }
    const url = await StorageService.getSignedUrl(candidate.resumeUrl);
    if (!url) return res.status(502).json({ success: false, message: 'Could not prepare the résumé link.' });
    return res.json({ success: true, url });
  } catch (error) {
    console.error('Resume signed URL error:', error);
    return res.status(500).json({ success: false, message: 'Could not load the résumé.' });
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
    if (candidate.deleted_at) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    // Re-queue for the background worker instead of blocking the request on a slow
    // AI call. The worker re-processes it (a stored résumé, or a manual entry's
    // details) and the UI polls the 'pending' → 'completed' transition to show
    // progress. Works for manual entries too (they get AI-screened from their
    // details), so no résumé-required restriction here.
    const updated = await CandidateRepo.requeueForAnalysis(req.params.id);
    return res.json({
      success: true,
      data: updated,
      message: 'Re-queued for AI analysis — scores will refresh here automatically in a few seconds.',
    });
  } catch (error) {
    console.error('Re-analyze error:', error);
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
// Cached ~30s: the dashboard is the landing page and this aggregates the whole
// candidate table, so at 50 branches every concurrent load would otherwise be its
// own full scan. The cache collapses them to one scan per window.
const DASHBOARD_TTL_MS = 30 * 1000;

async function computeDashboardData() {
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

    return {
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
    };
}

exports.getDashboardStats = async (req, res) => {
  try {
    const data = await getOrCompute('dashboard-stats', DASHBOARD_TTL_MS, computeDashboardData);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Stats aggregation error:', error);
    return res.status(500).json({ success: false, message: 'Server error aggregating stats' });
  }
};
