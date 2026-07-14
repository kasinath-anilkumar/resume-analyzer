const JobRepo = require('../models/jobRepo');
const CandidateRepo = require('../models/candidateRepo');
const SettingsRepo = require('../models/settingsRepo');
const ParserService = require('../services/parserService');
const AIService = require('../services/aiService');
const StorageService = require('../services/storageService');
const { scoreQuiz } = require('../services/quizScoring');

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
    const { jobId, name, email, phone, currentLocation, salaryExpectation } = req.body;
    if (!jobId || !name || !email) {
      return res.status(400).json({ success: false, message: 'Name, email and a job are required.' });
    }
    // A logged-in applicant (attachApplicant) may reuse their saved primary
    // résumé instead of uploading one.
    const usePrimaryResume = String(req.body.usePrimaryResume) === 'true' && Boolean(req.applicant?.resumeUrl);
    if ((!req.file || !req.file.buffer) && !usePrimaryResume) {
      return res.status(400).json({ success: false, message: 'Please attach your résumé.' });
    }

    // 1) Job must exist and be open. Use the FULL job (with quiz answer keys) so
    //    we can score server-side — never trust the client for correctness.
    const job = await JobRepo.findById(jobId);
    if (!job || job.status !== 'Active') {
      return res.status(404).json({ success: false, message: 'This position is no longer accepting applications.' });
    }

    // Block a repeat application to the same role by the same email.
    try {
      if (await CandidateRepo.existsForJobEmail(job._id, email)) {
        return res.status(409).json({
          success: false,
          code: 'ALREADY_APPLIED',
          message: "You've already applied to this position. You can track its status from your portal.",
        });
      }
    } catch (dupErr) {
      // Non-fatal: don't block a genuine applicant if the check itself errors.
      console.error('Apply dedup check failed:', dupErr.message);
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

    // 2b) Score the quiz (if the job has one) — MCQ is auto-graded server-side.
    let quizResult = {};
    if (job.quiz && Array.isArray(job.quiz.questions) && job.quiz.questions.length) {
      let quizAnswers = [];
      try {
        const parsed = typeof req.body.quizAnswers === 'string' ? JSON.parse(req.body.quizAnswers) : req.body.quizAnswers;
        if (Array.isArray(parsed)) quizAnswers = parsed;
      } catch (_) { /* ignore */ }
      quizResult = scoreQuiz(job.quiz, quizAnswers, {
        timeSpentSeconds: req.body.quizTimeSpent,
        tabSwitches: req.body.quizTabSwitches,
      });
    }

    // 3) Store the résumé. Either the uploaded file, or a COPY of the applicant's
    //    saved primary résumé (copied into a per-application object so lifecycle
    //    events like retention purge never touch the applicant's saved copy).
    let stored;
    try {
      if (req.file && req.file.buffer) {
        stored = await StorageService.uploadResume(req.file.buffer, req.file.originalname, req.file.mimetype);
      } else {
        const f = await StorageService.downloadResume(req.applicant.resumeUrl);
        stored = await StorageService.uploadResume(f.buffer, f.originalName, f.mimeType);
      }
    } catch (storageErr) {
      console.error('Apply: storage failed:', storageErr.message);
      return res.status(502).json({ success: false, message: 'We could not store your résumé. Please try again.' });
    }

    // 4) Create the candidate from the applicant's own details and QUEUE the
    //    résumé for background AI analysis. Applicants are never blocked by AI
    //    being unconfigured/rate-limited — the worker attaches scores later.
    const candidate = await CandidateRepo.create({
      name: name.trim(),
      email: String(email).trim().toLowerCase(),
      phone: (phone || '').trim(),
      currentLocation: (currentLocation || '').trim(),
      salaryExpectation: (salaryExpectation || '').trim(),
      resumeUrl: stored.url,
      jobId: job._id,
      applicantId: req.applicant?.id, // link to the portal account when signed in
      status: 'Applied',
      source: 'Application',
      screeningAnswers,
      quizResult,
      consentAt: new Date().toISOString(), // applicant consented on the apply form
      analysisStatus: 'pending',
      aiAnalysis: {},
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
