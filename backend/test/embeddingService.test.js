const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildCandidateText, buildJobText, _clip } = require('../services/embeddingService');

test('buildCandidateText includes skills & experience but NOT name/email (fairness)', () => {
  const text = buildCandidateText({
    name: 'Jane Applicant', email: 'jane@example.com',
    skills: ['Photography', 'Client Sales'],
    experience: [{ title: 'Freelance Photographer', company: 'Studio', description: 'Closed package sales, upsold albums.' }],
    projects: [{ title: 'Wedding Portfolio', description: 'Managed client shoots' }],
    aiAnalysis: { seniorityLevel: 'Mid', totalYearsExperience: 4, careerSummary: 'Creative pro with sales acumen.' },
  });
  assert.match(text, /Photography/);
  assert.match(text, /Closed package sales/);
  assert.match(text, /Seniority: Mid/);
  assert.match(text, /4 years experience/);
  // Personal identifiers must not leak into the matching text.
  assert.doesNotMatch(text, /Jane Applicant/);
  assert.doesNotMatch(text, /jane@example.com/);
});

test('buildJobText captures role, skills, and description', () => {
  const text = buildJobText({
    title: 'Sales Lead', department: 'Sales',
    requiredSkills: ['B2B Sales', 'Negotiation'], preferredSkills: ['CRM'],
    experience: '3+ years', description: 'Own the regional pipeline.',
  });
  assert.match(text, /Role: Sales Lead/);
  assert.match(text, /Required skills: B2B Sales, Negotiation/);
  assert.match(text, /Preferred skills: CRM/);
  assert.match(text, /Own the regional pipeline/);
});

test('empty inputs produce empty strings without throwing', () => {
  assert.equal(buildCandidateText({}), '');
  assert.equal(buildJobText({}), '');
  assert.equal(buildCandidateText(), '');
});

test('clip collapses whitespace and caps length', () => {
  assert.equal(_clip('  a   b\n\tc  '), 'a b c');
  assert.equal(_clip('x'.repeat(9000)).length, 8000);
});
