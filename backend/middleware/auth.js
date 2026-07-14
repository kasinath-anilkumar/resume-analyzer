const jwt = require('jsonwebtoken');
const UserRepo = require('../models/userRepo');
const ApplicantRepo = require('../models/applicantRepo');

// Protect routes — verify the JWT and load the current user from Supabase.
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Applicant (careers-portal) tokens are signed with the same secret but a
      // distinct type — they must NEVER authenticate a recruiter route.
      if (decoded.typ === 'applicant') {
        return res.status(401).json({ success: false, message: 'Not authorized for this area' });
      }

      req.user = await UserRepo.findById(decoded.id);
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }
      // Controllers read req.user.id (the Supabase uuid).
      req.user.id = req.user._id;

      next();
    } catch (error) {
      console.error('Auth protect error:', error);
      return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

// Protect careers-portal routes — verify an APPLICANT token and load the
// applicant. Kept fully separate from `protect`: a recruiter token cannot
// satisfy this, and an applicant token cannot satisfy `protect`.
const protectApplicant = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.typ !== 'applicant') {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    const applicant = await ApplicantRepo.findById(decoded.id);
    if (!applicant) {
      return res.status(401).json({ success: false, message: 'Not authorized, account not found' });
    }
    // Controllers scope every query to this applicant's own email.
    req.applicant = { id: applicant._id, email: applicant.email, name: applicant.name };
    next();
  } catch (error) {
    console.error('Applicant auth error:', error.message);
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

// Soft applicant auth: if a valid APPLICANT token is present, attach the full
// applicant profile to req.applicant — but never block (anonymous is allowed).
// Used on the public apply route so a logged-in applicant can reuse their saved
// primary résumé and have the application linked to their account.
const attachApplicant = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (h && h.startsWith('Bearer')) {
      const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
      if (decoded.typ === 'applicant') {
        const a = await ApplicantRepo.findById(decoded.id);
        if (a) req.applicant = a; // full profile (incl. resumeUrl)
      }
    }
  } catch (_) {
    // Invalid/expired token → treat as anonymous, don't block.
  }
  next();
};

module.exports = { protect, authorize, protectApplicant, attachApplicant };
