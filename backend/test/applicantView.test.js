const { test } = require('node:test');
const assert = require('node:assert/strict');

const { publicStatus, stageOf, toApplicantView, toApplicantDetail } = require('../services/applicantView');

// A candidate row loaded with internal recruiter data that must NOT leak.
const loadedCandidate = () => ({
  _id: 'cand-1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  status: 'Interview',
  createdAt: '2026-06-01T00:00:00Z',
  jobId: { _id: 'job-1', title: 'Sales Associate', department: 'Sales', location: 'Kochi', employmentType: 'Full-time', description: 'Sell things' },
  aiAnalysis: { overallScore: 91, screeningVerdict: 'Strong Fit', redFlags: [{ type: 'Job hopping', detail: 'secret' }] },
  notes: [{ note: 'INTERNAL: push to final round', author: { name: 'Recruiter' } }],
  quizResult: { score: 80, answers: [{ correctAnswer: 'B', correct: true }] },
  interviews: [
    { stage: 'HR Round', scheduledAt: '2026-06-20T10:00:00Z', mode: 'Online', locationOrLink: 'https://meet/x', interviewer: 'Asha', notes: 'ask about gap' },
    { stage: 'Technical', scheduledAt: '2026-06-10T10:00:00Z', mode: 'Onsite', locationOrLink: 'HQ', interviewer: 'Ravi', notes: 'internal' },
  ],
});

test('publicStatus translates internal pipeline statuses', () => {
  assert.equal(publicStatus('Applied'), 'Application Received');
  assert.equal(publicStatus('Screening'), 'Under Review');
  assert.equal(publicStatus('Technical Round'), 'Interview Stage');
  assert.equal(publicStatus('Hired'), 'Hired');
  assert.equal(publicStatus('Rejected'), 'Not Selected');
  assert.equal(publicStatus('somethingWeird'), 'Application Received'); // safe default
});

test('stageOf maps status to a timeline index and outcome tone', () => {
  assert.deepEqual(stageOf('Applied'), { index: 0, outcome: 'pending' });
  assert.deepEqual(stageOf('Shortlisted'), { index: 1, outcome: 'pending' });
  assert.deepEqual(stageOf('HR Round'), { index: 2, outcome: 'pending' });
  assert.deepEqual(stageOf('Offer'), { index: 3, outcome: 'positive' });
  assert.deepEqual(stageOf('Rejected'), { index: 3, outcome: 'negative' });
});

test('SECURITY: the applicant view leaks no internal recruiter data', () => {
  const detail = toApplicantDetail(loadedCandidate());
  const json = JSON.stringify(detail);
  for (const secret of ['overallScore', 'screeningVerdict', 'redFlags', 'Job hopping', 'INTERNAL', 'correctAnswer', 'aiAnalysis', 'ask about gap']) {
    assert.ok(!json.includes(secret), `applicant view must not expose "${secret}"`);
  }
  // It DOES carry the safe, expected fields.
  assert.equal(detail.status, 'Interview Stage');
  assert.equal(detail.job.title, 'Sales Associate');
});

test('interviews are sanitized (no private notes) and sorted by date', () => {
  const detail = toApplicantDetail(loadedCandidate());
  assert.equal(detail.interviews.length, 2);
  assert.ok(detail.interviews.every((i) => !('notes' in i)), 'interview notes must be stripped');
  // Sorted ascending by scheduledAt -> Technical (Jun 10) before HR (Jun 20).
  assert.equal(detail.interviews[0].mode, 'Onsite');
  assert.equal(detail.interviews[1].mode, 'Online');
  assert.equal(detail.interviews[0].interviewer, 'Ravi');
});

test('timeline marks progress and the current stage', () => {
  const detail = toApplicantDetail(loadedCandidate()); // status Interview -> index 2
  assert.equal(detail.timeline.length, 4);
  assert.equal(detail.timeline[0].done, true);
  assert.equal(detail.timeline[2].current, true);
  assert.equal(detail.timeline[3].done, false);
});

test('toApplicantView is a lean list card', () => {
  const view = toApplicantView(loadedCandidate());
  assert.deepEqual(Object.keys(view).sort(), ['_id', 'appliedAt', 'job', 'nextInterviewAt', 'outcome', 'stageIndex', 'status'].sort());
  assert.equal(view.nextInterviewAt, '2026-06-20T10:00:00Z'); // latest scheduled
});

test('serializers tolerate a missing/empty candidate', () => {
  assert.equal(toApplicantView(null), null);
  assert.equal(toApplicantDetail(undefined), null);
  const bare = toApplicantView({ _id: 'x', status: 'Applied' });
  assert.equal(bare.job.title, 'A role');
  assert.equal(bare.nextInterviewAt, null);
});
