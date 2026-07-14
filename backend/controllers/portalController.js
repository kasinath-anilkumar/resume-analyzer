const CandidateRepo = require('../models/candidateRepo');
const ApplicantRepo = require('../models/applicantRepo');
const StorageService = require('../services/storageService');
const { toApplicantView, toApplicantDetail } = require('../services/applicantView');

// Careers-portal application tracking. Every query is scoped to the signed-in
// applicant's own email (set by protectApplicant), and every candidate row is
// run through the applicant-safe serializer so no recruiter data leaks.

// @desc    List the applicant's own applications
// @route   GET /api/portal/applications
// @access  Private (applicant)
exports.getMyApplications = async (req, res) => {
  try {
    const rows = await CandidateRepo.listForApplicant(req.applicant.email);
    return res.json({ success: true, count: rows.length, data: rows.map(toApplicantView) });
  } catch (error) {
    console.error('Portal applications error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your applications.' });
  }
};

// @desc    Update the applicant's own profile (name, phone, links, bio)
// @route   PUT /api/portal/me
// @access  Private (applicant)
exports.updateMe = async (req, res) => {
  try {
    const { name, phone, linkedinUrl, portfolioUrl, bio, resumeUrl, location } = req.body;
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
    }
    const updated = await ApplicantRepo.updateProfile(req.applicant.id, { name, phone, linkedinUrl, portfolioUrl, bio, resumeUrl, location });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Portal updateMe error:', error);
    return res.status(500).json({ success: false, message: 'Could not save your profile.' });
  }
};

// @desc    Upload/replace the applicant's reusable primary résumé
// @route   POST /api/portal/resume
// @access  Private (applicant)
exports.uploadResume = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please attach a résumé file.' });
    }
    let stored;
    try {
      stored = await StorageService.uploadResume(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (storageErr) {
      console.error('Portal résumé upload storage failed:', storageErr.message);
      return res.status(502).json({ success: false, message: 'Could not store your résumé. Please try again.' });
    }
    await ApplicantRepo.updateResume(req.applicant.id, stored.url);
    return res.json({ success: true, data: { resumeUrl: stored.url, name: req.file.originalname } });
  } catch (error) {
    console.error('Portal uploadResume error:', error);
    return res.status(500).json({ success: false, message: 'Could not upload your résumé.' });
  }
};

// @desc    One application's detail (status timeline + interviews)
// @route   GET /api/portal/applications/:id
// @access  Private (applicant)
exports.getMyApplication = async (req, res) => {
  try {
    const row = await CandidateRepo.findForApplicant(req.params.id, req.applicant.email);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    return res.json({ success: true, data: toApplicantDetail(row) });
  } catch (error) {
    console.error('Portal application detail error:', error);
    return res.status(500).json({ success: false, message: 'Could not load this application.' });
  }
};
