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
const { authLimiter } = require('../middleware/rateLimit');

// Public self-registration for STAFF is disabled — recruiter accounts are
// created by an Admin (POST /api/auth/users). Applicants self-register via
// /api/portal/register.
// Rate-limit the unauthenticated credential endpoints to slow brute-forcing.
router.post('/signin', authLimiter, signin); // unified: staff OR applicant
router.post('/forgot', authLimiter, unifiedForgot); // unified: staff OR applicant
router.post('/login', authLimiter, loginUser); // staff-only (kept for compatibility)
router.post('/forgot-password', authLimiter, forgotPassword);
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
