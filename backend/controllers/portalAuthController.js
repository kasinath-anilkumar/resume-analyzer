const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ApplicantRepo = require('../models/applicantRepo');
const EmailService = require('../services/emailService');

// Applicant (careers-portal) auth. Deliberately SEPARATE from authController:
// applicants self-register (public sign-up is enabled here, unlike recruiters)
// and their tokens carry `typ:'applicant'` so they can never reach recruiter
// routes.
const generateToken = (id) =>
  jwt.sign({ id, typ: 'applicant' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const appBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '');
  return 'http://localhost:5173';
};

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const isEmail = (s) => /.+@.+\..+/.test(String(s || ''));

// @desc    Register a careers-portal account
// @route   POST /api/portal/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (await ApplicantRepo.existsByEmail(email)) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
    }
    const applicant = await ApplicantRepo.create({ name: name.trim(), email, password, phone });
    return res.status(201).json({
      success: true,
      _id: applicant._id,
      name: applicant.name,
      email: applicant.email,
      token: generateToken(applicant._id),
    });
  } catch (error) {
    console.error('Portal register error:', error);
    return res.status(500).json({ success: false, message: 'Server error creating your account' });
  }
};

// @desc    Log in to the careers portal
// @route   POST /api/portal/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const row = await ApplicantRepo.findRawByEmail(email);
    if (row && (await ApplicantRepo.matchPassword(password, row))) {
      const applicant = ApplicantRepo.toApi(row);
      return res.json({
        success: true,
        _id: applicant._id,
        name: applicant.name,
        email: applicant.email,
        token: generateToken(applicant._id),
      });
    }
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  } catch (error) {
    console.error('Portal login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// @desc    Current applicant profile (full)
// @route   GET /api/portal/me
// @access  Private (applicant)
exports.getMe = async (req, res) => {
  try {
    const a = await ApplicantRepo.findById(req.applicant.id);
    if (!a) return res.status(404).json({ success: false, message: 'Account not found.' });
    return res.json({ success: true, ...a });
  } catch (error) {
    console.error('Portal getMe error:', error);
    return res.status(500).json({ success: false, message: 'Could not load your profile.' });
  }
};

// @desc    Change the signed-in applicant's password
// @route   POST /api/portal/change-password
// @access  Private (applicant)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }
    const row = await ApplicantRepo.findRawById(req.applicant.id);
    if (!row || !(await ApplicantRepo.matchPassword(currentPassword, row))) {
      return res.status(400).json({ success: false, message: 'Your current password is incorrect.' });
    }
    await ApplicantRepo.updatePassword(row.id, newPassword);
    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Portal changePassword error:', error);
    return res.status(500).json({ success: false, message: 'Server error changing password.' });
  }
};

// @desc    Request a password reset link
// @route   POST /api/portal/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  // Generic response regardless of whether the email exists (no enumeration).
  const generic = {
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent (valid for 1 hour).',
  };
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const row = await ApplicantRepo.findRawByEmail(email);
    if (row) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await ApplicantRepo.setResetToken(row.id, sha256(token), expires);
      const link = `${appBaseUrl()}/portal/reset-password?token=${token}&email=${encodeURIComponent(row.email)}`;
      await EmailService.sendApplicantPasswordReset({ name: row.name, email: row.email }, link);
    }
    return res.json(generic);
  } catch (error) {
    console.error('Portal forgot-password error:', error);
    return res.status(500).json({ success: false, message: 'Server error during password reset request' });
  }
};

// @desc    Complete a password reset
// @route   POST /api/portal/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    const row = await ApplicantRepo.findByResetTokenHash(sha256(token));
    if (!row || (email && row.email !== ApplicantRepo.normalizeEmail(email))) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Request a new one.' });
    }
    await ApplicantRepo.updatePassword(row.id, password);
    return res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch (error) {
    console.error('Portal reset-password error:', error);
    return res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
};
