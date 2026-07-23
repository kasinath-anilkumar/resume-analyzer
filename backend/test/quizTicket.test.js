const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long!!';
const { issueQuizTicket, readQuizTicket, MAX_TICKET_AGE_SECONDS } = require('../utils/quizTicket');

const JOB = 'job-abc-123';
const T0 = 1_700_000_000_000; // fixed clock so these never depend on wall time

test('a freshly issued ticket reads back as valid with ~zero elapsed', () => {
  const ticket = issueQuizTicket(JOB, T0);
  const r = readQuizTicket(ticket, JOB, T0);
  assert.equal(r.valid, true);
  assert.equal(r.elapsedSeconds, 0);
});

test('elapsed time is measured by the SERVER clock, not the client', () => {
  const ticket = issueQuizTicket(JOB, T0);
  const r = readQuizTicket(ticket, JOB, T0 + 125_000); // 125s later
  assert.equal(r.valid, true);
  assert.equal(r.elapsedSeconds, 125);
});

test('SECURITY: a tampered issue time fails the signature', () => {
  const ticket = issueQuizTicket(JOB, T0);
  const [jobId, issuedAt, sig] = ticket.split('.');
  // Backdate the clock to fake a timeout and skip the answer-all gate.
  const forged = `${jobId}.${Number(issuedAt) - 99999}.${sig}`;
  assert.deepEqual(readQuizTicket(forged, JOB, T0), { valid: false, elapsedSeconds: null });
});

test('SECURITY: a ticket for one job cannot be replayed against another', () => {
  const ticket = issueQuizTicket(JOB, T0);
  assert.equal(readQuizTicket(ticket, 'a-different-job', T0).valid, false);
});

test('SECURITY: a forged signature is rejected', () => {
  const [jobId, issuedAt] = issueQuizTicket(JOB, T0).split('.');
  assert.equal(readQuizTicket(`${jobId}.${issuedAt}.notarealsignature`, JOB, T0).valid, false);
});

test('a stale ticket is rejected rather than reporting a huge elapsed', () => {
  const ticket = issueQuizTicket(JOB, T0);
  const past = readQuizTicket(ticket, JOB, T0 + (MAX_TICKET_AGE_SECONDS - 5) * 1000);
  assert.equal(past.valid, true);
  const stale = readQuizTicket(ticket, JOB, T0 + (MAX_TICKET_AGE_SECONDS + 5) * 1000);
  assert.equal(stale.valid, false);
});

test('a future-dated ticket (clock skew / forgery) is rejected', () => {
  const ticket = issueQuizTicket(JOB, T0 + 60_000);
  assert.equal(readQuizTicket(ticket, JOB, T0).valid, false);
});

test('missing / malformed tickets are rejected without throwing', () => {
  for (const bad of [undefined, null, '', 'nope', 'a.b', 'a.b.c.d', 42, {}]) {
    assert.deepEqual(readQuizTicket(bad, JOB, T0), { valid: false, elapsedSeconds: null }, `should reject: ${String(bad)}`);
  }
});
