const { test } = require('node:test');
const assert = require('node:assert/strict');

// Give the supabase client dummy config so requiring the repo doesn't print the
// "[FATAL] Supabase is not configured" warning. We only exercise pure mapping
// helpers here (toApi / toPublic) — no query ever hits the network.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const JobRepo = require('../models/jobRepo');

const row = () => ({
  id: 'job-1',
  title: 'Engineer',
  department: 'Engineering',
  description: 'Build things',
  required_skills: ['js', 'node'],
  preferred_skills: ['ts'],
  experience: '2+ years',
  salary_range: '10-20',
  employment_type: 'Full-time',
  location: 'Remote',
  number_openings: 2,
  status: 'Active',
  screening_questions: ['Why us?'],
  quiz: {
    timeLimitMinutes: 15,
    questions: [
      { id: 'q1', type: 'mcq', question: 'Pick B', options: ['a', 'b'], correctIndex: 1 },
      { id: 'q2', type: 'text', question: 'Tell us more' },
    ],
  },
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
});

test('toApi maps snake_case columns to the camelCase API shape', () => {
  const j = JobRepo.toApi(row());
  assert.equal(j._id, 'job-1');
  assert.equal(j.salaryRange, '10-20');
  assert.equal(j.employmentType, 'Full-time');
  assert.equal(j.numberOpenings, 2);
  assert.deepEqual(j.requiredSkills, ['js', 'node']);
  assert.deepEqual(j.preferredSkills, ['ts']);
  assert.deepEqual(j.screeningQuestions, ['Why us?']);
  assert.equal(j.createdBy, 'user-1');
  assert.equal(j.createdAt, '2026-01-01T00:00:00Z');
  assert.equal(j.updatedAt, '2026-01-02T00:00:00Z');
});

test('toApi defaults array/object fields when columns are null', () => {
  const j = JobRepo.toApi({ id: 'x', title: 'T' });
  assert.deepEqual(j.requiredSkills, []);
  assert.deepEqual(j.preferredSkills, []);
  assert.deepEqual(j.screeningQuestions, []);
  assert.deepEqual(j.quiz, {});
});

test('toApi returns a falsy value for a missing row', () => {
  assert.ok(!JobRepo.toApi(null));
  assert.ok(!JobRepo.toApi(undefined));
});

test('SECURITY: toPublic strips quiz correctIndex so applicants cannot cheat', () => {
  const pub = JobRepo.toPublic(row());
  const mcq = pub.quiz.questions.find((q) => q.id === 'q1');
  // The answer key must NOT be present on the public view.
  assert.ok(!('correctIndex' in mcq), 'correctIndex must be stripped from the public quiz');
  // But the options (the choices) are still shown.
  assert.deepEqual(mcq.options, ['a', 'b']);
  // Belt-and-suspenders: the serialized public job must not mention the key at all.
  assert.ok(!JSON.stringify(pub).includes('correctIndex'));
});

test('SECURITY: toPublic omits recruiter-only fields', () => {
  const pub = JobRepo.toPublic(row());
  for (const secret of ['status', 'createdBy', 'numberOpenings', 'updatedAt', 'created_by']) {
    assert.ok(!(secret in pub), `${secret} must not be exposed on the public job`);
  }
  // Sanity: it still carries the fields the careers page needs.
  assert.equal(pub._id, 'job-1');
  assert.equal(pub.title, 'Engineer');
  assert.equal(pub.employmentType, 'Full-time');
});

test('toPublic keeps text questions free of options', () => {
  const pub = JobRepo.toPublic(row());
  const textQ = pub.quiz.questions.find((q) => q.id === 'q2');
  assert.equal(textQ.type, 'text');
  assert.ok(!('options' in textQ));
});
