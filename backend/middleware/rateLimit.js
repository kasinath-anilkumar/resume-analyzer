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

// Throttle public résumé submissions to curb spam/abuse. Keyed by client IP.
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many applications from this network. Please try again later.',
    }),
});

module.exports = { authLimiter, applyLimiter };
