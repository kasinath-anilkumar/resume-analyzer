// Signed quiz tickets — a tamper-proof record of when a quiz was actually
// started.
//
// The apply form previously reported its own elapsed time (`quizTimeSpent`) and
// the server believed it. Two things followed from that:
//   1. Posting a huge value made the server treat the attempt as "timed out",
//      which SKIPS the "every question must be answered" gate.
//   2. The recruiter-visible completion time was whatever the applicant claimed,
//      so a slow attempt could be presented as a fast one.
//
// A ticket is issued when the quiz is handed out (GET /api/public/jobs/:id) and
// carries the issue time under an HMAC. At submit the server recomputes elapsed
// from the ticket, so the number is its own — the client can no longer influence
// it. The ticket is bound to the job id, so one job's ticket can't be replayed
// against another.
//
// Honest limitation: a ticket is minted per quiz fetch, so an applicant who
// re-fetches the job right before submitting gets a fresh clock. This removes
// the forged-timeout bypass and casual tampering; defeating it fully needs a
// persisted per-attempt record, which is a bigger change than this warrants.

const crypto = require('crypto');

// Signed with JWT_SECRET (already required to be >=32 chars at boot) under a
// distinct label, so a quiz ticket can never be confused with a session token.
const secret = () => `quiz-ticket:${process.env.JWT_SECRET || ''}`;

// Tickets older than this are not trusted — an applicant who leaves the tab open
// for a day and returns should get a fresh one rather than a nonsense elapsed.
const MAX_TICKET_AGE_SECONDS = 24 * 60 * 60;

const sign = (payload) =>
  crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

/**
 * Issue a ticket for a job's quiz. Returns an opaque string for the client to
 * hand back verbatim on submit.
 * @param {string} jobId
 * @param {number} [nowMs] injectable clock for tests
 */
function issueQuizTicket(jobId, nowMs = Date.now()) {
  const payload = `${jobId}.${Math.floor(nowMs / 1000)}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a ticket and report how long ago it was issued.
 * @returns {{ valid: boolean, elapsedSeconds: number|null }}
 *   valid=false for a missing, malformed, mis-signed, wrong-job, future-dated or
 *   stale ticket. elapsedSeconds is only meaningful when valid.
 */
function readQuizTicket(ticket, jobId, nowMs = Date.now()) {
  const invalid = { valid: false, elapsedSeconds: null };
  if (!ticket || typeof ticket !== 'string') return invalid;

  const parts = ticket.split('.');
  if (parts.length !== 3) return invalid;
  const [ticketJobId, issuedAtRaw, signature] = parts;
  if (String(ticketJobId) !== String(jobId)) return invalid;

  const expected = sign(`${ticketJobId}.${issuedAtRaw}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return invalid;

  const issuedAt = parseInt(issuedAtRaw, 10);
  if (!Number.isFinite(issuedAt)) return invalid;

  const elapsed = Math.floor(nowMs / 1000) - issuedAt;
  // Negative => clock skew or a forged future timestamp; too old => stale.
  if (elapsed < 0 || elapsed > MAX_TICKET_AGE_SECONDS) return invalid;

  return { valid: true, elapsedSeconds: elapsed };
}

module.exports = { issueQuizTicket, readQuizTicket, MAX_TICKET_AGE_SECONDS };
