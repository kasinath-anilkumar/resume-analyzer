const JobRepo = require('../models/jobRepo');
const CandidateRepo = require('../models/candidateRepo');
const SettingsRepo = require('../models/settingsRepo');
const ParserService = require('../services/parserService');
const AIService = require('../services/aiService');
const StorageService = require('../services/storageService');
const { scoreQuiz } = require('../services/quizScoring');
const CandidateMatcher = require('../services/candidateMatcher');

const resolveAiConfig = async () => {
  try {
    const s = await SettingsRepo.get();
    return { apiKey: s.aiApiKey, provider: s.aiProvider, model: s.aiModel };
  } catch (_) {
    return {};
  }
};

// --- Public-input validation -------------------------------------------------
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
// Clip a free-text field to a sane max so a public submission can't bloat the DB
// or amplify AI token cost with megabytes of junk (bodies are already ≤1MB, but
// per-field caps keep individual columns bounded).
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
// How many applications one email may submit per rolling day. The same-email/
// same-job dedup blocks true duplicates; this bounds an attacker fanning a single
// email across many roles to trigger repeated (paid) AI analyses.
const MAX_APPLICATIONS_PER_EMAIL_PER_DAY = 15;

// --- Manual details entry (applicant has no résumé) -------------------------
// Parse the structured details the careers form collects and map them to the
// candidate's stored shapes (matching what the AI parser would produce, so the
// recruiter UI renders them identically). Returns null when nothing usable.
const parseManualDetails = (raw) => {
  let md = raw;
  if (typeof raw === 'string') { try { md = JSON.parse(raw); } catch { return null; } }
  if (!md || typeof md !== 'object') return null;
  const has = (arr) => Array.isArray(arr) && arr.length > 0;
  if (!String(md.skills || '').trim() && !has(md.education) && !has(md.experience) && !has(md.projects)) return null;
  return md;
};

// Caps keep a public manual entry bounded (no megabyte arrays bloating the row
// or amplifying AI token cost). c() clips individual strings.
const c = (v, n = 500) => String(v == null ? '' : v).slice(0, n);
const mapManualDetails = (md) => ({
  skills: String(md.skills || '')
    .split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 100).map((s) => c(s, 100)),
  education: (Array.isArray(md.education) ? md.education : [])
    .filter((e) => e && (e.school || e.degree)).slice(0, 30)
    .map((e) => ({ school: c(e.school), degree: c(e.degree), fieldOfStudy: '', startYear: '', endYear: c(e.year, 20) })),
  experience: (Array.isArray(md.experience) ? md.experience : [])
    .filter((e) => e && (e.company || e.title)).slice(0, 30)
    .map((e) => ({ title: c(e.title), company: c(e.company), startDate: '', endDate: c(e.duration, 50), description: c(e.desc, 3000) })),
  projects: (Array.isArray(md.projects) ? md.projects : [])
    .filter((p) => p && p.name).slice(0, 30)
    .map((p) => ({ title: c(p.name), link: '', description: c(p.desc, 3000) })),
});

const verdictFromScore = (s) => (s >= 75 ? 'Strong Fit' : s >= 55 ? 'Potential Fit' : s >= 40 ? 'Weak Fit' : 'Not a Fit');

// A Meta-lead résumé-upload link (/u/:token) expires this many days after the
// lead was created, and is single-use — so a leaked/forwarded WhatsApp link
// can't be replayed to re-trigger (paid) analysis indefinitely.
const LEAD_TOKEN_TTL_DAYS = 30;
const isLeadTokenExpired = (lead) => {
  const anchor = lead.createdAt || lead.requestedAt;
  if (!anchor) return false;
  return Date.now() - new Date(anchor).getTime() > LEAD_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
};
const isLeadAlreadySubmitted = (lead) => Boolean(lead.resumeSubmittedAt || lead.resumeUrl);

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
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (String(name).trim().length > 200) {
      return res.status(400).json({ success: false, message: 'Name is too long.' });
    }
    // Per-email daily cap: bound how many (AI-triggering) applications a single
    // email can create in 24h, independent of the per-IP limiter.
    try {
      const recent = await CandidateRepo.countRecentByEmail(
        email,
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      );
      if (recent >= MAX_APPLICATIONS_PER_EMAIL_PER_DAY) {
        return res.status(429).json({
          success: false,
          message: 'You have submitted several applications recently. Please try again later.',
        });
      }
    } catch (capErr) {
      console.error('Apply per-email cap check failed:', capErr.message);
    }
    // A logged-in applicant (attachApplicant) may reuse their saved primary
    // résumé instead of uploading one. An applicant with NO résumé may instead
    // enter their details manually (manualDetails).
    const usePrimaryResume = String(req.body.usePrimaryResume) === 'true' && Boolean(req.applicant?.resumeUrl);
    const manualDetails = parseManualDetails(req.body.manualDetails);
    if ((!req.file || !req.file.buffer) && !usePrimaryResume && !manualDetails) {
      return res.status(400).json({ success: false, message: 'Please attach your résumé, or enter your details manually.' });
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
          .slice(0, 50) // cap count
          .map((a) => ({ question: clip(a.question, 2000), answer: clip(a.answer, 5000) }));
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

    // 2c) MANUAL DETAILS path — applicant has no résumé. Store the structured
    //     details DIRECTLY (no file, no AI round-trip) so the profile is complete
    //     and searchable immediately, and compute an instant deterministic fit
    //     score against the role (the keyword matcher needs no AI/network).
    if (manualDetails && (!req.file || !req.file.buffer) && !usePrimaryResume) {
      const mapped = mapManualDetails(manualDetails);
      const det = CandidateMatcher.scoreMatch(
        { skills: mapped.skills, experience: mapped.experience, projects: mapped.projects, aiAnalysis: {} },
        job
      );
      const candidate = await CandidateRepo.create({
        name: name.trim(),
        email: String(email).trim().toLowerCase(),
        phone: (phone || '').trim(),
        currentLocation: (currentLocation || '').trim(),
        salaryExpectation: (salaryExpectation || '').trim(),
        skills: mapped.skills,
        education: mapped.education,
        experience: mapped.experience,
        projects: mapped.projects,
        resumeUrl: null, // no résumé on file — details entered manually
        jobId: job._id,
        applicantId: req.applicant?.id,
        status: 'Applied',
        source: 'Application',
        screeningAnswers,
        quizResult,
        consentAt: new Date().toISOString(),
        // Queue for background AI screening (the worker builds a profile from
        // these fields and runs the full report). The deterministic score below
        // is an INSTANT baseline so the candidate is scored + ranked immediately,
        // and remains the score if AI is unconfigured/unavailable.
        analysisStatus: 'pending',
        aiAnalysis: {
          overallScore: det.score,
          screeningVerdict: verdictFromScore(det.score),
          matchExplanation: det.reason,
          manualEntry: true,      // no résumé — details entered by the applicant
          analyzedFrom: 'form',   // analysis is from the entered details, not a résumé
        },
      });
      return res.status(201).json({
        success: true,
        message: `Thank you, ${name.trim()}! Your application for ${job.title} has been received.`,
        data: { _id: candidate._id },
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

// @desc    Validate a Meta-lead résumé-upload token (the WhatsApp link target)
// @route   GET /api/public/lead/:token
// @access  Public (token is the credential)
exports.getLeadByToken = async (req, res) => {
  try {
    const lead = await CandidateRepo.findByUploadToken(req.params.token);
    if (!lead || isLeadTokenExpired(lead)) {
      return res.status(404).json({ success: false, message: 'This link is invalid or has expired.' });
    }
    let jobTitle = 'a role';
    try {
      const job = await JobRepo.findById(lead.jobId);
      if (job) jobTitle = job.title;
    } catch (_) { /* non-fatal */ }
    return res.json({
      success: true,
      data: { name: lead.name, jobTitle, alreadySubmitted: isLeadAlreadySubmitted(lead) },
    });
  } catch (error) {
    console.error('Lead token lookup error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

// @desc    Attach a résumé to a Meta lead via its upload token → triggers analysis
// @route   POST /api/public/lead/:token/resume
// @access  Public (token-scoped), rate-limited
exports.submitLeadResume = async (req, res) => {
  try {
    const lead = await CandidateRepo.findByUploadToken(req.params.token);
    if (!lead || isLeadTokenExpired(lead)) {
      return res.status(404).json({ success: false, message: 'This link is invalid or has expired.' });
    }
    // Single-use: once a résumé is attached, the link can't be replayed to
    // re-queue (paid) analysis.
    if (isLeadAlreadySubmitted(lead)) {
      return res.status(409).json({
        success: false,
        message: 'A résumé has already been submitted for this link. Thank you!',
      });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please attach your résumé (PDF or DOCX).' });
    }
    let stored;
    try {
      stored = await StorageService.uploadResume(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (storageErr) {
      console.error('Lead résumé storage failed:', storageErr.message);
      return res.status(502).json({ success: false, message: 'We could not store your résumé. Please try again.' });
    }
    // Attach + requeue for AI analysis (worker picks up analysis_status='pending').
    const updated = await CandidateRepo.attachResumeByToken(req.params.token, stored.url);
    if (!updated) return res.status(404).json({ success: false, message: 'This link is invalid or has expired.' });
    return res.json({
      success: true,
      message: `Thank you${lead.name ? ', ' + lead.name : ''}! Your résumé was received and is being reviewed.`,
    });
  } catch (error) {
    console.error('Lead résumé submit error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};
