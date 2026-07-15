const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeAnalytics } = require('../services/analyticsService');

// --- Fixtures ---------------------------------------------------------------
// Fixed clock so month bucketing is deterministic (2026-07-15).
const NOW = new Date('2026-07-15T12:00:00Z').getTime();
const day = (n) => new Date(2026, 6, n, 10, 0, 0).toISOString(); // July n, 2026

const jobs = [
  { _id: 'job-sales', title: 'Sales Lead', department: 'Sales', status: 'Active' },
  { _id: 'job-dev', title: 'Frontend Dev', department: 'Engineering', status: 'Active' },
  { _id: 'job-old', title: 'Retired Role', department: 'Ops', status: 'Closed' },
];

const candidates = [
  // Applied via portal, strong fit, high score, hired 3 days after applying.
  { _id: 'c1', jobId: 'job-sales', status: 'Hired', source: 'Application', overallScore: 92,
    screeningVerdict: 'Strong Fit', seniorityLevel: 'Senior', quizScore: 80,
    createdAt: day(1), updatedAt: day(4) },
  // Manual entry, reached shortlist then interview, no quiz.
  { _id: 'c2', jobId: 'job-sales', status: 'Interview', source: 'Manual', overallScore: 74,
    screeningVerdict: 'Potential Fit', seniorityLevel: 'Mid', quizScore: null,
    createdAt: day(2), updatedAt: day(6) },
  // Application, weak fit, rejected, failed quiz.
  { _id: 'c3', jobId: 'job-dev', status: 'Rejected', source: 'Application', overallScore: 41,
    screeningVerdict: 'Weak Fit', seniorityLevel: 'Junior', quizScore: 45,
    createdAt: day(3), updatedAt: day(5) },
  // Application, still Applied, unscored (pending analysis).
  { _id: 'c4', jobId: 'job-dev', status: 'Applied', source: 'Application', overallScore: 0,
    screeningVerdict: null, seniorityLevel: null, quizScore: null,
    createdAt: day(7), updatedAt: day(7) },
];

// --- Tests ------------------------------------------------------------------
test('totals: counts, analyzed, active jobs, avg score', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  assert.equal(a.totals.totalCandidates, 4);
  assert.equal(a.totals.analyzedCount, 3);       // c4 has score 0 → not analyzed
  assert.equal(a.totals.totalJobs, 3);
  assert.equal(a.totals.activeJobs, 2);
  assert.equal(a.totals.hiredCount, 1);
  assert.equal(a.totals.avgScore, Math.round(((92 + 74 + 41) / 3) * 10) / 10); // 69
});

test('conversion funnel uses cumulative gates (interview counts include hired)', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  const shortlisted = a.conversion.find((c) => c.to === 'Shortlisted');
  // c1 (Hired) and c2 (Interview) have both passed the shortlist gate.
  assert.equal(shortlisted.count, 2);
  assert.equal(shortlisted.base, 4);
  assert.equal(shortlisted.rate, 50);
  const offered = a.conversion.find((c) => c.to === 'Offer');
  assert.equal(offered.count, 1); // only the hired candidate reached offer/hired
});

test('source effectiveness splits Application vs Manual with rates', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  const app = a.sourceEffectiveness.find((s) => s.source === 'Application');
  const man = a.sourceEffectiveness.find((s) => s.source === 'Manual');
  assert.equal(app.count, 3);
  assert.equal(man.count, 1);
  // Application avg score over analyzed only (92, 41) = 66.5
  assert.equal(app.avgScore, 66.5);
  assert.equal(app.hireRate, Math.round((1 / 3) * 1000) / 10); // 33.3
});

test('verdict distribution buckets known verdicts + an Unscored group', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  const byName = Object.fromEntries(a.verdictDistribution.map((v) => [v.name, v.value]));
  assert.equal(byName['Strong Fit'], 1);
  assert.equal(byName['Potential Fit'], 1);
  assert.equal(byName['Weak Fit'], 1);
  assert.equal(byName['Not a Fit'], 0);
  assert.equal(byName['Unscored'], 1); // c4
});

test('score histogram counts only analyzed candidates', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  const total = a.scoreHistogram.reduce((s, b) => s + b.value, 0);
  assert.equal(total, 3); // 92, 74, 41 — c4's 0 excluded
  assert.equal(a.scoreHistogram.find((b) => b.name === '85–100').value, 1);
  assert.equal(a.scoreHistogram.find((b) => b.name === '70–84').value, 1);
});

test('quiz stats: completion, average, pass rate at mark 60', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  assert.equal(a.quizStats.taken, 2);             // c1 (80), c3 (45)
  assert.equal(a.quizStats.avgScore, 62.5);
  assert.equal(a.quizStats.passRate, 50);         // 80 passes, 45 fails
  assert.equal(a.quizStats.completionRate, 50);   // 2 of 4 candidates
});

test('time-to-hire is approximate and averages Hired durations', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  assert.equal(a.timeToHire.approximate, true);
  assert.equal(a.timeToHire.sample, 1);
  assert.equal(a.timeToHire.avgDays, 3); // day(1) → day(4) = 3 days
});

test('per-job performance ranks by applications and computes hires', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  assert.equal(a.perJob[0].jobId, 'job-sales'); // 2 apps, tie broken by order but sales has 2
  const sales = a.perJob.find((j) => j.jobId === 'job-sales');
  assert.equal(sales.applications, 2);
  assert.equal(sales.hires, 1);
  const old = a.perJob.find((j) => j.jobId === 'job-old');
  assert.equal(old.applications, 0);
  assert.equal(old.avgScore, 0); // no candidates → guarded division
});

test('applications-over-time returns 6 month buckets ending on the given now', () => {
  const a = computeAnalytics(candidates, jobs, { now: NOW });
  assert.equal(a.applicationsOverTime.length, 6);
  const july = a.applicationsOverTime[a.applicationsOverTime.length - 1];
  assert.equal(july.month, 'Jul');
  assert.equal(july.Applications, 4); // all four created in July 2026
  assert.equal(july.Hired, 1);
});

test('handles empty pools without throwing', () => {
  const a = computeAnalytics([], [], { now: NOW });
  assert.equal(a.totals.totalCandidates, 0);
  assert.equal(a.totals.avgScore, 0);
  assert.equal(a.conversion[0].rate, 0);
  assert.equal(a.quizStats.passRate, 0);
  assert.equal(a.timeToHire.sample, 0);
  assert.deepEqual(a.perJob, []);
});
