const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserRepo = require('../models/userRepo');
const EmailService = require('../services/emailService');
const AuditRepo = require('../models/auditRepo');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// Public app (frontend) base URL, used in emailed links.
const appBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '');
  return 'http://localhost:5173';
};

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Valid roles for admin-created accounts. Public self-registration is disabled;
// accounts are created by an Admin via POST /api/auth/users.
const VALID_ROLES = ['Admin', 'Recruiter', 'Hiring Manager'];

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const row = await UserRepo.findRawByEmail(email);
    if (row && (await UserRepo.matchPassword(password, row))) {
      const user = UserRepo.toApi(row);
      return res.json({
        success: true,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    }
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// @desc    Forgot Password request
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  // Always return the same generic response so this endpoint can't be used to
  // discover which emails have accounts (user enumeration).
  const generic = {
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent (valid for 1 hour).',
  };
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const row = await UserRepo.findRawByEmail(email);
    if (row) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      await UserRepo.setResetToken(row.id, sha256(token), expires);

      const link = `${appBaseUrl()}/reset-password?token=${token}&email=${encodeURIComponent(row.email)}`;
      const result = await EmailService.sendPasswordReset({ name: row.name, email: row.email }, link);
      if (!result.sent && !EmailService.isConfigured()) {
        // Email isn't configured — tell the admin so they aren't left guessing.
        return res.json({
          success: true,
          message: 'Reset link generated, but email is not configured on the server. Ask an administrator to set RESEND_API_KEY.',
        });
      }
    }
    return res.json(generic);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error during password reset request' });
  }
};

// @desc    Complete a password reset with the emailed token
// @route   POST /api/auth/reset-password
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

    const row = await UserRepo.findByResetTokenHash(sha256(token));
    if (!row || (email && row.email !== String(email).trim().toLowerCase())) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Request a new one.' });
    }

    await UserRepo.updatePassword(row.id, password);
    return res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
};

// @desc    Change the signed-in user's own password
// @route   PUT /api/auth/password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const row = await UserRepo.findRawById(req.user.id);
    if (!row || !(await UserRepo.matchPassword(currentPassword, row))) {
      return res.status(400).json({ success: false, message: 'Your current password is incorrect.' });
    }

    await UserRepo.updatePassword(row.id, newPassword);
    AuditRepo.log(req.user, 'auth.password_change', { entityType: 'auth', entityId: req.user.id, summary: 'Changed own password' });
    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error changing password' });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await UserRepo.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error fetching user profile' });
  }
};

// ============================================================================
//  Admin-only User Management
// ============================================================================

// @desc    List all users
// @route   GET /api/auth/users
// @access  Private (Admin)
exports.getUsers = async (req, res) => {
  try {
    const users = await UserRepo.list();
    return res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error listing users' });
  }
};

// @desc    Create a user (any role)
// @route   POST /api/auth/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    const finalRole = VALID_ROLES.includes(role) ? role : 'Hiring Manager';

    if (await UserRepo.existsByEmail(email)) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists.' });
    }
    const user = await UserRepo.create({ name, email, password, role: finalRole });
    AuditRepo.log(req.user, 'user.create', { entityType: 'user', entityId: user._id, summary: `Created user ${user.email} (${user.role})` });
    return res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error creating user' });
  }
};

// @desc    Change a user's role
// @route   PUT /api/auth/users/:id/role
// @access  Private (Admin)
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "You can't change your own role." });
    }

    const target = await UserRepo.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    // Never demote the last remaining Admin.
    if (target.role === 'Admin' && role !== 'Admin') {
      const admins = await UserRepo.countByRole('Admin');
      if (admins <= 1) {
        return res.status(400).json({ success: false, message: 'There must be at least one Admin.' });
      }
    }
    const updated = await UserRepo.updateRole(req.params.id, role);
    AuditRepo.log(req.user, 'user.role_change', { entityType: 'user', entityId: req.params.id, summary: `Changed ${target.email} role: ${target.role} → ${role}` });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error updating role' });
  }
};

// @desc    Delete a user
// @route   DELETE /api/auth/users/:id
// @access  Private (Admin)
exports.deleteUser = async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "You can't delete your own account." });
    }

    const target = await UserRepo.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (target.role === 'Admin') {
      const admins = await UserRepo.countByRole('Admin');
      if (admins <= 1) {
        return res.status(400).json({ success: false, message: 'There must be at least one Admin.' });
      }
    }
    await UserRepo.remove(req.params.id);
    AuditRepo.log(req.user, 'user.delete', { entityType: 'user', entityId: req.params.id, summary: `Deleted user ${target.email} (${target.role})` });
    return res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error deleting user' });
  }
};
