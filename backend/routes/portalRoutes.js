const express = require('express');
const router = express.Router();
const { register, login, getMe, changePassword, forgotPassword, resetPassword } = require('../controllers/portalAuthController');
const { getMyApplications, getMyApplication, withdrawMyApplication, updateMe, uploadResume, getMyResumeUrl } = require('../controllers/portalController');
const { protectApplicant } = require('../middleware/auth');
const { authLimiter, accountLimiter } = require('../middleware/rateLimit');
const upload = require('../middleware/upload');

// Careers-portal (applicant-facing) endpoints. Auth is separate from the
// recruiter app — applicants self-register and only ever see their own data.

// Auth (public, throttled). Two layers like the recruiter routes: a per-IP flood
// cap (authLimiter) PLUS a strict per-email cap (accountLimiter) so a single
// applicant email can't be brute-forced or reset-email-bombed. reset-password is
// token-only → per-IP cap only.
router.post('/register', authLimiter, accountLimiter, register);
router.post('/login', authLimiter, accountLimiter, login);
router.post('/forgot-password', authLimiter, accountLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

// Self-service (applicant token required)
router.get('/me', protectApplicant, getMe);
router.put('/me', protectApplicant, updateMe);
router.post('/change-password', protectApplicant, changePassword);
router.post('/resume', protectApplicant, upload.single('resume'), upload.validateResumeContent, uploadResume);
router.get('/me/resume-url', protectApplicant, getMyResumeUrl);
router.get('/applications', protectApplicant, getMyApplications);
router.get('/applications/:id', protectApplicant, getMyApplication);
router.post('/applications/:id/withdraw', protectApplicant, withdrawMyApplication);

module.exports = router;
