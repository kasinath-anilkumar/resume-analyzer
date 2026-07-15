const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// NOTE (scaling): these use express-rate-limit's default in-memory store, which
// is per-instance and resets on restart. That's fine for a single always-on web
// instance. If you run MULTIPLE web instances (horizontal scale), swap in a
// shared store (Upstash/Redis or a Postgres store) so limits are enforced across
// the fleet — otherwise each instance counts independently.

const tooMany = (message) => (req, res) => res.status(429).json({ success: false, message });

// IPv6-safe IP portion (masks v6 to a /56 so a single client can't cycle addresses).
const ipPart = (req) => ipKeyGenerator(req.ip);
const emailOf = (req) => String(req.body?.email || '').trim().toLowerCase();

// --- Auth: TWO layers so a busy branch (many staff behind one office NAT) is
// never locked out, while a single ACCOUNT is still protected from brute force.

// (1) Generous per-IP flood cap — catches egregious automated hammering from one
//     source without blocking a whole branch of legitimate simultaneous logins.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100, // ~a branch of 20 staff × 5 tries per 15 min
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Too many attempts from this network. Please wait a few minutes and try again.'),
});

// (2) Strict per-ACCOUNT cap — stops targeted credential guessing against one
//     email regardless of source IP. Skipped when there's no email (e.g. a
//     token-only reset), where the per-IP cap above still applies.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12, // per email per 15 min
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => !emailOf(req),
  keyGenerator: (req) => `acct:${emailOf(req)}`,
  handler: tooMany('Too many attempts for this account. Please wait a few minutes or reset your password.'),
});

// Sustained cap on public résumé submissions per IP. Generous because applicants
// from the SAME branch/office share one public IP (NAT). The real per-person
// guard is the duplicate check (existsForJobEmail).
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipPart,
  handler: tooMany('Too many applications from this network in the last hour. Please try again later.'),
});

// Short burst guard: stops rapid automated flooding (which could spike memory on
// a small host) while staying well above what humans filling a form can hit.
const applyBurstLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipPart,
  handler: tooMany('You are submitting too quickly. Please wait a moment and try again.'),
});

module.exports = { authLimiter, accountLimiter, applyLimiter, applyBurstLimiter };
