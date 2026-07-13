const jwt = require('jsonwebtoken');
const UserRepo = require('../models/userRepo');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

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
  try {
    const { email } = req.body;
    const row = await UserRepo.findRawByEmail(email);
    if (!row) {
      return res.status(404).json({ success: false, message: 'No user registered with this email' });
    }
    return res.json({
      success: true,
      message: 'A password reset link has been sent to your registered email address (valid for 10 minutes).',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error during password reset request' });
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
    return res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error deleting user' });
  }
};
