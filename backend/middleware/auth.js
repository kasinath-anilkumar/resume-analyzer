const jwt = require('jsonwebtoken');
const UserRepo = require('../models/userRepo');
const ApplicantRepo = require('../models/applicantRepo');

// Pin the algorithm so a token can only be validated as HS256 (defense-in-depth
// against algorithm-confusion if an asymmetric key is ever introduced).
const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

// Session revocation: a token minted BEFORE the account's last password change is
// no longer valid (changing/resetting a password logs out other sessions). 1s of
// skew tolerance. Accounts that never changed their password have no timestamp →
// tokens stay valid (backward compatible).
const isStaleSession = (decoded, passwordChangedAt) => {
  if (!passwordChangedAt || !decoded || !decoded.iat) return false;
  return decoded.iat * 1000 < new Date(passwordChangedAt).getTime() - 1000;
};

// Protect routes — verify the JWT and load the current user from Supabase.
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = verifyToken(token);

      // Applicant (careers-portal) tokens are signed with the same secret but a
      // distinct type — they must NEVER authenticate a recruiter route.
      if (decoded.typ === 'applicant') {
        return res.status(401).json({ success: false, message: 'Not authorized for this area' });
      }

      req.user = await UserRepo.findById(decoded.id);
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }
      if (isStaleSession(decoded, req.user.passwordChangedAt)) {
        return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
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
    const decoded = verifyToken(token);
    if (decoded.typ !== 'applicant') {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    const applicant = await ApplicantRepo.findById(decoded.id);
    if (!applicant) {
      return res.status(401).json({ success: false, message: 'Not authorized, account not found' });
    }
    if (isStaleSession(decoded, applicant.passwordChangedAt)) {
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
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
      const decoded = verifyToken(h.split(' ')[1]);
      if (decoded.typ === 'applicant') {
        const a = await ApplicantRepo.findById(decoded.id);
        // Expose BOTH `id` and `_id`. findById returns the toApi shape (`_id`),
        // while protectApplicant exposes `id` — callers used `req.applicant.id`,
        // which was silently undefined here, so applications from signed-in
        // applicants were never linked to their account (applicant_id stayed
        // null). Normalizing keeps every consumer working on either name.
        if (a && !isStaleSession(decoded, a.passwordChangedAt)) {
          req.applicant = { ...a, id: a._id }; // full profile (incl. resumeUrl)
        }
      }
    }
  } catch (_) {
    // Invalid/expired token → treat as anonymous, don't block.
  }
  next();
};

module.exports = { protect, authorize, protectApplicant, attachApplicant };
