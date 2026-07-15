const express = require('express');
const router = express.Router();
const {
  loginUser,
  signin,
  unifiedForgot,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  getUsers,
  createUser,
  updateUserRole,
  deleteUser,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { authLimiter, accountLimiter } = require('../middleware/rateLimit');

// Public self-registration for STAFF is disabled — recruiter accounts are
// created by an Admin (POST /api/auth/users). Applicants self-register via
// /api/portal/register.
// Rate-limit the unauthenticated credential endpoints: a generous per-IP flood
// cap (authLimiter) so a whole branch behind one NAT isn't locked out, PLUS a
// strict per-account cap (accountLimiter) on the email-bearing endpoints to stop
// targeted brute force. reset-password is token-only → per-IP cap only.
router.post('/signin', authLimiter, accountLimiter, signin); // unified: staff OR applicant
router.post('/forgot', authLimiter, accountLimiter, unifiedForgot); // unified: staff OR applicant
router.post('/login', authLimiter, accountLimiter, loginUser); // staff-only (kept for compatibility)
router.post('/forgot-password', authLimiter, accountLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/me', protect, getMe);
router.put('/password', protect, changePassword);

// --- Admin-only User Management ---
router.route('/users')
  .get(protect, authorize('Admin'), getUsers)
  .post(protect, authorize('Admin'), createUser);
router.put('/users/:id/role', protect, authorize('Admin'), updateUserRole);
router.delete('/users/:id', protect, authorize('Admin'), deleteUser);

module.exports = router;
