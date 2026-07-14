const CandidateRepo = require('../models/candidateRepo');
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
