const JobRepo = require('../models/jobRepo');
const CandidateRepo = require('../models/candidateRepo');
const SettingsRepo = require('../models/settingsRepo');
const ParserService = require('../services/parserService');
const AIService = require('../services/aiService');
const StorageService = require('../services/storageService');

const resolveAiConfig = async () => {
  try {
    const s = await SettingsRepo.get();
    return { apiKey: s.aiApiKey, provider: s.aiProvider, model: s.aiModel };
  } catch (_) {
    return {};
  }
};

// @desc    Public list of open jobs (careers page)
// @route   GET /api/public/jobs
// @access  Public
exports.listJobs = async (req, res) => {
  try {
    const jobs = await JobRepo.listPublic();
    return res.json({ success: true, count: jobs.length, data: jobs });
  } catch (error) {
    console.error('Public jobs error:', error);
    return res.status(500).json({ success: false, message: 'Could not load open positions.' });
  }
};

// @desc    Public single job detail
// @route   GET /api/public/jobs/:id
// @access  Public
exports.getJob = async (req, res) => {
  try {
    const job = await JobRepo.findPublicById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'This position is no longer open.' });
    }
    return res.json({ success: true, data: job });
  } catch (error) {
    console.error('Public job error:', error);
    return res.status(500).json({ success: false, message: 'Could not load this position.' });
  }
};

// @desc    Public application submission
// @route   POST /api/public/apply
// @access  Public
exports.apply = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please attach your résumé.' });
    }
    const { jobId, name, email, phone } = req.body;
    if (!jobId || !name || !email) {
      return res.status(400).json({ success: false, message: 'Name, email and a job are required.' });
    }

    // 1) Job must exist and be open.
    const job = await JobRepo.findPublicById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'This position is no longer accepting applications.' });
    }

    // 2) Parse screening answers (sent as a JSON string from the form).
    let screeningAnswers = [];
    try {
      const parsed = typeof req.body.screeningAnswers === 'string' ? JSON.parse(req.body.screeningAnswers) : req.body.screeningAnswers;
      if (Array.isArray(parsed)) {
        screeningAnswers = parsed
          .filter((a) => a && a.question)
          .map((a) => ({ question: String(a.question), answer: String(a.answer || '') }));
      }
    } catch (_) { /* ignore malformed answers */ }

    // 3) Extract résumé text (best-effort).
    let extractedText = '';
    try {
      extractedText = await ParserService.extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (parseErr) {
      console.warn('Apply: résumé parse failed:', parseErr.message);
    }

    // 4) Store the résumé (required — a candidate must have a résumé on file).
    let stored;
    try {
      stored = await StorageService.uploadResume(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (storageErr) {
      console.error('Apply: storage failed:', storageErr.message);
      return res.status(502).json({ success: false, message: 'We could not store your résumé. Please try again.' });
    }

    // 5) AI analysis — BEST EFFORT. An applicant must never be blocked because
    //    AI is unconfigured or rate-limited; scores are attached only if they work.
    let ai = null;
    if (extractedText) {
      try {
        ai = await AIService.analyzeResume(extractedText, job, await resolveAiConfig());
      } catch (aiErr) {
        console.warn('Apply: AI analysis skipped:', aiErr.message);
      }
    }

    // 6) Create the candidate from the applicant's own details (AI fills the rest).
    const candidate = await CandidateRepo.create({
      name: name.trim() || ai?.name || 'Applicant',
      email: String(email).trim().toLowerCase(),
      phone: (phone || ai?.phone || '').trim(),
      resumeUrl: stored.url,
      skills: ai?.skills || [],
      education: ai?.education || [],
      experience: ai?.experience || [],
      projects: ai?.projects || [],
      certifications: ai?.certifications || [],
      languages: ai?.languages || [],
      githubUrl: ai?.githubUrl || '',
      linkedInUrl: ai?.linkedInUrl || '',
      portfolioUrl: ai?.portfolioUrl || '',
      jobId: job._id,
      status: 'Applied',
      source: 'Application',
      screeningAnswers,
      aiAnalysis: ai?.aiAnalysis || {},
    });

    return res.status(201).json({
      success: true,
      message: `Thank you, ${name.trim()}! Your application for ${job.title} has been received.`,
      data: { _id: candidate._id },
    });
  } catch (error) {
    console.error('Apply error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong submitting your application. Please try again.' });
  }
};
