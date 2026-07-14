const JobRepo = require('../models/jobRepo');
const CandidateRepo = require('../models/candidateRepo');
const SettingsRepo = require('../models/settingsRepo');
const ParserService = require('../services/parserService');
const AIService = require('../services/aiService');
const AuditRepo = require('../models/auditRepo');

// Resolve the AI provider/key configured through Settings (same as candidate
// upload) so poster extraction uses whatever key the admin configured.
const resolveAiConfig = async () => {
  try {
    const s = await SettingsRepo.get();
    return { apiKey: s.aiApiKey, provider: s.aiProvider, model: s.aiModel };
  } catch (err) {
    console.error('Failed to resolve AI config, using defaults', err.message);
    return {};
  }
};

// Aggregate candidate counts per job from a minimal stats projection.
const buildJobCounts = (candStats) => {
  const map = {};
  for (const c of candStats) {
    const j = String(c.jobId);
    if (!map[j]) map[j] = { candidateCount: 0, shortlistedCount: 0, hiredCount: 0 };
    map[j].candidateCount += 1;
    if (c.status === 'Shortlisted') map[j].shortlistedCount += 1;
    if (c.status === 'Hired') map[j].hiredCount += 1;
  }
  return map;
};

const zeroCounts = { candidateCount: 0, shortlistedCount: 0, hiredCount: 0 };

// @desc    Get all jobs (with query filtering)
// @route   GET /api/jobs
// @access  Private
exports.getJobs = async (req, res) => {
  try {
    const { department, location, employmentType, status, search } = req.query;
    const jobs = await JobRepo.list({ department, location, employmentType, status, search });
    const counts = buildJobCounts(await CandidateRepo.allForStats());

    const data = jobs.map((job) => ({ ...job, ...(counts[String(job._id)] || zeroCounts) }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error retrieving jobs' });
  }
};

// @desc    Get single job details
// @route   GET /api/jobs/:id
// @access  Private
exports.getJobById = async (req, res) => {
  try {
    const job = await JobRepo.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const counts = buildJobCounts(await CandidateRepo.allForStats());
    return res.json({ success: true, data: { ...job, ...(counts[String(job._id)] || zeroCounts) } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error retrieving job details' });
  }
};

// @desc    Extract structured job fields from an uploaded hiring poster image
// @route   POST /api/jobs/extract-poster
// @access  Private (Admin, Recruiter, Hiring Manager)
// Note: this does NOT create a job — it returns parsed fields so the recruiter
// can review/edit them in the form before submitting.
exports.extractJobFromPoster = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please upload a poster image' });
    }

    // 1. OCR / extract text from the poster (reuses the resume parser).
    let posterText;
    try {
      posterText = await ParserService.extractText(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
    } catch (parseErr) {
      return res.status(422).json({ success: false, message: `Failed to read the poster: ${parseErr.message}` });
    }

    // 2. Ask the configured LLM to structure it into job fields.
    const aiConfig = await resolveAiConfig();
    let extracted;
    try {
      extracted = await AIService.extractJobFromText(posterText, aiConfig);
    } catch (aiErr) {
      console.error('Poster extraction failed:', aiErr.message);
      return res.status(aiErr.status || 502).json({
        success: false,
        code: aiErr.code || 'AI_FAILED',
        message: aiErr.message || 'AI extraction failed. Please verify the API key in Settings.',
      });
    }

    return res.json({ success: true, data: extracted });
  } catch (error) {
    console.error('Poster extraction error:', error);
    return res.status(500).json({ success: false, message: 'Server error extracting job from poster' });
  }
};

// @desc    Create new job posting
// @route   POST /api/jobs
// @access  Private (Admin, Recruiter, Hiring Manager)
exports.createJob = async (req, res) => {
  try {
    const job = await JobRepo.create(req.body, req.user.id);
    AuditRepo.log(req.user, 'job.create', { entityType: 'job', entityId: job._id, summary: `Created job "${job.title}"` });
    return res.status(201).json({ success: true, data: job });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error creating job posting' });
  }
};

// @desc    Update job posting
// @route   PUT /api/jobs/:id
// @access  Private (Admin, Recruiter)
exports.updateJob = async (req, res) => {
  try {
    const existing = await JobRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const job = await JobRepo.update(req.params.id, req.body);
    AuditRepo.log(req.user, 'job.update', { entityType: 'job', entityId: req.params.id, summary: `Updated job "${job.title}"` });
    return res.json({ success: true, data: job });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error updating job posting' });
  }
};

// @desc    Delete job posting
// @route   DELETE /api/jobs/:id
// @access  Private (Admin, Recruiter)
exports.deleteJob = async (req, res) => {
  try {
    const job = await JobRepo.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    // Associated candidate rows are removed automatically (job_id cascade).
    await JobRepo.remove(req.params.id);
    AuditRepo.log(req.user, 'job.delete', { entityType: 'job', entityId: req.params.id, summary: `Deleted job "${job.title}" (and its candidates)` });
    return res.json({ success: true, message: 'Job posting and associated candidates deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error deleting job posting' });
  }
};

// @desc    Duplicate job posting
// @route   POST /api/jobs/:id/duplicate
// @access  Private (Admin, Recruiter)
exports.duplicateJob = async (req, res) => {
  try {
    const job = await JobRepo.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const duplicate = await JobRepo.create(
      {
        title: `${job.title} (Copy)`,
        department: job.department,
        description: job.description,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        experience: job.experience,
        salaryRange: job.salaryRange,
        employmentType: job.employmentType,
        location: job.location,
        numberOpenings: job.numberOpenings,
        status: 'Draft',
      },
      req.user.id
    );
    return res.status(201).json({ success: true, data: duplicate });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error duplicating job' });
  }
};

// @desc    Close job posting
// @route   PUT /api/jobs/:id/close
// @access  Private (Admin, Recruiter)
exports.closeJob = async (req, res) => {
  try {
    const existing = await JobRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const job = await JobRepo.update(req.params.id, { status: 'Closed' });
    return res.json({ success: true, data: job });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error closing job' });
  }
};

// @desc    Archive job posting
// @route   PUT /api/jobs/:id/archive
// @access  Private (Admin, Recruiter)
exports.archiveJob = async (req, res) => {
  try {
    const existing = await JobRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const job = await JobRepo.update(req.params.id, { status: 'Archived' });
    return res.json({ success: true, data: job });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error archiving job' });
  }
};

// @desc    Re-activate a job — reopen a Closed job, publish a Draft, or restore
//          an Archived one (sets status back to Active).
// @route   PUT /api/jobs/:id/activate
// @access  Private (Admin, Recruiter)
exports.activateJob = async (req, res) => {
  try {
    const existing = await JobRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const job = await JobRepo.update(req.params.id, { status: 'Active' });
    return res.json({ success: true, data: job });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error activating job' });
  }
};
