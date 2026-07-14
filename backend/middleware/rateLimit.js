const rateLimit = require('express-rate-limit');

// Throttle credential-guessing on the auth endpoints. Keyed by client IP.
// Returns the app's standard { success, message } shape on 429 so the frontend
// surfaces it like any other error.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // max attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many attempts. Please wait a few minutes and try again.',
    }),
});

// Sustained cap on public résumé submissions per IP. Set generously because
// applicants from the SAME branch/office share one public IP (NAT) — a strict
// limit would block a whole branch during a hiring drive. The real per-person
// guard is the duplicate check (existsForJobEmail): you can't apply to the same
// role twice with one email regardless of this limit.
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 120, // ~2/min sustained — comfortably covers a busy branch
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many applications from this network in the last hour. Please try again later.',
    }),
});

// Short burst guard: stops rapid automated flooding (which could spike memory on
// a small host) while staying well above what humans filling a form can hit.
const applyBurstLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'You are submitting too quickly. Please wait a moment and try again.',
    }),
});

module.exports = { authLimiter, applyLimiter, applyBurstLimiter };
