const crypto = require('crypto');
const ApplicantRepo = require('../models/applicantRepo');
const CandidateRepo = require('../models/candidateRepo');
const StorageService = require('../services/storageService');
const EmailService = require('../services/emailService');
const AuditRepo = require('../models/auditRepo');
const { getClient } = require('../config/supabase');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const appBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '');
  return 'http://localhost:5173';
};

// @desc    List everyone registered on the careers portal (applicant accounts),
//          with how many roles each has applied to.
// @route   GET /api/applicants
// @access  Private (Admin, Recruiter)
exports.listApplicants = async (req, res) => {
  try {
    const applicants = await ApplicantRepo.listAll();
    let countsByEmail = {};
    try {
      countsByEmail = await CandidateRepo.applicationCountsByEmail();
    } catch (countErr) {
      console.error('Application counts failed:', countErr.message);
    }
    const data = applicants.map((a) => ({
      ...a,
      applications: countsByEmail[String(a.email || '').toLowerCase()] || 0,
    }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('List applicants error:', error);
    return res.status(500).json({ success: false, message: 'Server error loading portal users' });
  }
};

// @desc    Get detailed portal user (applicant) account details
// @route   GET /api/applicants/:id
// @access  Private (Admin, Recruiter)
exports.getApplicantDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const applicant = await ApplicantRepo.findById(id);
    if (!applicant) {
      return res.status(404).json({ success: false, message: 'Portal user not found' });
    }

    // Query candidates table for applications submitted under this account's email
    const { data: apps, error: appsErr } = await getClient()
      .from('candidates')
      .select('id, job_id, status, created_at, ai_analysis')
      .eq('email', applicant.email)
      .is('deleted_at', null);

    if (appsErr) throw appsErr;

    // Fetch details of referenced jobs
    const jobIds = [...new Set(apps.map((app) => app.job_id).filter(Boolean))];
    let jobsLookup = {};
    if (jobIds.length > 0) {
      const { data: jobsData, error: jobsErr } = await getClient()
        .from('jobs')
        .select('id, title, department')
        .in('id', jobIds);
      if (jobsErr) throw jobsErr;
      (jobsData || []).forEach((j) => {
        jobsLookup[j.id] = { _id: j.id, title: j.title, department: j.department };
      });
    }

    const applications = apps.map((app) => ({
      _id: app.id,
      status: app.status,
      createdAt: app.created_at,
      score: app.ai_analysis?.overallScore || 0,
      job: jobsLookup[app.job_id] || { _id: app.job_id, title: 'Unknown Role', department: 'Unknown' },
    }));

    return res.json({
      success: true,
      data: {
        ...applicant,
        applications,
      },
    });
  } catch (error) {
    console.error('Get applicant details error:', error);
    return res.status(500).json({ success: false, message: 'Server error loading portal user details' });
  }
};

// @desc    Update a portal user's profile (recruiter/admin correction).
// @route   PUT /api/applicants/:id
// @access  Private (Admin, Recruiter)
exports.updateApplicant = async (req, res) => {
  try {
    const { name, phone, location, linkedinUrl, portfolioUrl, bio } = req.body;
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
    }
    const updated = await ApplicantRepo.updateProfile(req.params.id, { name, phone, location, linkedinUrl, portfolioUrl, bio });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Portal user not found' });
    }
    AuditRepo.log(req.user, 'applicant.update', { entityType: 'applicant', entityId: req.params.id, summary: `Updated portal user ${updated.name}` });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update applicant error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating portal user' });
  }
};

// @desc    Delete a portal ACCOUNT only (their applications are kept, unlinked).
// @route   DELETE /api/applicants/:id
// @access  Private (Admin, Recruiter)
exports.deleteApplicantAccount = async (req, res) => {
  try {
    const removed = await ApplicantRepo.deleteById(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Portal user not found' });
    }
    if (removed.resumeUrl) await StorageService.deleteResume(removed.resumeUrl).catch(() => {});
    AuditRepo.log(req.user, 'applicant.delete', { entityType: 'applicant', entityId: req.params.id, summary: `Deleted portal account ${removed.email}` });
    return res.json({ success: true, message: 'Portal account deleted. Their applications are kept.' });
  } catch (error) {
    console.error('Delete applicant error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting portal user' });
  }
};

// @desc    GDPR erase — delete the account AND every application + all résumés.
// @route   DELETE /api/applicants/:id/erase
// @access  Private (Admin, Recruiter)
exports.erasePerson = async (req, res) => {
  try {
    const applicant = await ApplicantRepo.findById(req.params.id);
    if (!applicant) {
      return res.status(404).json({ success: false, message: 'Portal user not found' });
    }
    const email = String(applicant.email || '').toLowerCase();
    const removedCandidates = await CandidateRepo.hardDeleteAllForEmail(email);
    for (const r of removedCandidates) await StorageService.deleteResume(r.resumeUrl).catch(() => {});
    const account = await ApplicantRepo.deleteByEmail(email);
    if (account?.resumeUrl) await StorageService.deleteResume(account.resumeUrl).catch(() => {});
    AuditRepo.log(req.user, 'applicant.erase_person', {
      entityType: 'applicant', entityId: req.params.id,
      summary: `GDPR erase: ${email} — ${removedCandidates.length} application(s) + account`,
    });
    return res.json({
      success: true,
      message: `Erased all data for ${email}: ${removedCandidates.length} application(s) and their portal account.`,
    });
  } catch (error) {
    console.error('Erase applicant person error:', error);
    return res.status(500).json({ success: false, message: 'Server error erasing portal user' });
  }
};

// @desc    Email the portal user a password-reset link (recruiter-initiated).
// @route   POST /api/applicants/:id/send-reset
// @access  Private (Admin, Recruiter)
exports.sendReset = async (req, res) => {
  try {
    const applicant = await ApplicantRepo.findById(req.params.id);
    if (!applicant) {
      return res.status(404).json({ success: false, message: 'Portal user not found' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await ApplicantRepo.setResetToken(applicant._id, sha256(token), expires);
    const link = `${appBaseUrl()}/portal/reset-password?token=${token}&email=${encodeURIComponent(applicant.email)}`;
    const result = await EmailService.sendApplicantPasswordReset({ name: applicant.name, email: applicant.email }, link);
    AuditRepo.log(req.user, 'applicant.send_reset', { entityType: 'applicant', entityId: req.params.id, summary: `Sent password reset to ${applicant.email}` });
    return res.json({
      success: true,
      message: result.sent
        ? `Password reset link sent to ${applicant.email}.`
        : 'Reset link generated, but email is not configured/deliverable yet (verify the Resend domain to email applicants).',
    });
  } catch (error) {
    console.error('Send reset error:', error);
    return res.status(500).json({ success: false, message: 'Server error sending reset link' });
  }
};
