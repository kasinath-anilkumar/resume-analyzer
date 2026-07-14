const express = require('express');
const router = express.Router();
const { register, login, getMe, forgotPassword, resetPassword } = require('../controllers/portalAuthController');
const { getMyApplications, getMyApplication } = require('../controllers/portalController');
const { protectApplicant } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

// Careers-portal (applicant-facing) endpoints. Auth is separate from the
// recruiter app — applicants self-register and only ever see their own data.

// Auth (public, throttled)
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

// Self-service (applicant token required)
router.get('/me', protectApplicant, getMe);
router.get('/applications', protectApplicant, getMyApplications);
router.get('/applications/:id', protectApplicant, getMyApplication);

module.exports = router;
