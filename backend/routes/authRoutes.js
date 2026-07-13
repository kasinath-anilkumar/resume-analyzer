const express = require('express');
const router = express.Router();
const {
  loginUser,
  forgotPassword,
  getMe,
  getUsers,
  createUser,
  updateUserRole,
  deleteUser,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

// Public self-registration is disabled — accounts are created by an Admin via
// the User Management panel (POST /api/auth/users).
// Rate-limit the unauthenticated credential endpoints to slow brute-forcing.
router.post('/login', authLimiter, loginUser);
router.post('/forgot-password', authLimiter, forgotPassword);
router.get('/me', protect, getMe);

// --- Admin-only User Management ---
router.route('/users')
  .get(protect, authorize('Admin'), getUsers)
  .post(protect, authorize('Admin'), createUser);
router.put('/users/:id/role', protect, authorize('Admin'), updateUserRole);
router.delete('/users/:id', protect, authorize('Admin'), deleteUser);

module.exports = router;
