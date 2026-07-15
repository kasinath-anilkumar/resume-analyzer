const { test } = require('node:test');
const assert = require('node:assert/strict');

const { scoreMatch, rankPool, bandFor, _requiredYears, cosineSimilarity, semanticScore, hybridScore } = require('../services/candidateMatcher');

// --- Fixtures ---------------------------------------------------------------
const developer = {
  _id: 'c-dev',
  analysisStatus: 'completed',
  jobId: { _id: 'job-dev', title: 'Frontend Developer' },
  skills: ['JavaScript', 'React', 'Node.js', 'Git', 'CSS'],
  experience: [{ title: 'Frontend Developer', company: 'Acme', description: 'Built React apps on a Node backend' }],
  aiAnalysis: { totalYearsExperience: 3 },
};

const photographer = {
  _id: 'c-photo',
  analysisStatus: 'completed',
  jobId: { _id: 'job-photo', title: 'Photographer' },
  skills: ['Adobe Photoshop', 'Lightroom', 'Photography', 'Client Communication', 'Social Media', 'Time Management'],
  experience: [
    {
      title: 'Freelance Photographer',
      company: 'Studio',
      description:
        'Managed client relationships and closed photography package sales; upsold albums; drove 30% revenue growth.',
    },
  ],
  aiAnalysis: { totalYearsExperience: 4, careerSummary: 'Creative photographer with strong client and sales skills.' },
};

const devJob = {
  _id: 'job-dev',
  title: 'Frontend Developer',
  requiredSkills: ['JavaScript', 'React', 'CSS', 'Git'],
  preferredSkills: ['TypeScript', 'Node'],
  experience: '2+ Years',
};

const salesJob = {
  _id: 'job-sales',
  title: 'Sales Associate',
  requiredSkills: ['Sales', 'Client Communication', 'Negotiation', 'CRM'],
  preferredSkills: ['Upselling', 'Social Media'],
  experience: '1+ Years',
};

// --- Direct match -----------------------------------------------------------
test('a developer scores strongly against a developer job', () => {
  const m = scoreMatch(developer, devJob);
  assert.ok(m.score >= 80, `expected >=80, got ${m.score}`);
  assert.equal(m.band, 'Strong');
  for (const s of ['JavaScript', 'React', 'CSS', 'Git']) assert.ok(m.matchedRequired.includes(s));
  assert.deepEqual(m.missingRequired, []);
});

// --- Transferable / cross-role fit (the whole point of the feature) ---------
test('a photographer with sales experience is recommendable for a Sales role', () => {
  const m = scoreMatch(photographer, salesJob);
  assert.ok(m.score >= 40, `expected a recommendable score >=40, got ${m.score}`);
  // "Sales" is matched from résumé prose, not the explicit skill list.
  assert.ok(m.matchedRequired.includes('Sales'));
  assert.ok(m.transferable.includes('Sales'), '"Sales" should be flagged as inferred from experience');
  // "Client Communication" is an explicit skill -> matched, not transferable.
  assert.ok(m.matchedRequired.includes('Client Communication'));
  assert.ok(!m.transferable.includes('Client Communication'));
  // Skills the résumé has no evidence for stay missing.
  assert.ok(m.missingRequired.includes('CRM'));
});

test('the same photographer does NOT fit an unrelated developer role', () => {
  const m = scoreMatch(photographer, devJob);
  assert.ok(m.score < 40, `expected <40, got ${m.score}`);
  // And the cross-role sales fit clearly beats the irrelevant dev fit.
  assert.ok(scoreMatch(photographer, salesJob).score > m.score);
});

// --- Fallback when a job under-specifies skills -----------------------------
test('scoreMatch falls back to title keywords when a job lists no skills', () => {
  const bareJob = { _id: 'j', title: 'Photographer', requiredSkills: [], preferredSkills: [], experience: '' };
  const m = scoreMatch(photographer, bareJob);
  assert.ok(m.matchedRequired.includes('photographer'));
  assert.ok(m.score > 0);
});

// --- rankPool ---------------------------------------------------------------
test('rankPool ranks the pool against a job and applies inclusion rules', () => {
  const lowApplicant = {
    _id: 'low-applicant',
    analysisStatus: 'completed',
    jobId: { _id: 'job-sales', title: 'Sales Associate' }, // applied HERE
    skills: ['Data Entry'],
    experience: [],
    aiAnalysis: {},
  };
  const barista = {
    _id: 'barista',
    analysisStatus: 'completed',
    jobId: { _id: 'job-cafe', title: 'Barista' },
    skills: ['Coffee', 'Latte Art'],
    experience: [{ title: 'Barista', description: 'Made coffee' }],
    aiAnalysis: {},
  };
  const stillPending = {
    _id: 'pending',
    analysisStatus: 'pending',
    jobId: { _id: 'job-x', title: 'X' },
    skills: [],
    experience: [],
    aiAnalysis: {},
  };

  const ranked = rankPool([barista, photographer, lowApplicant, stillPending], salesJob, { min: 40 });

  const ids = ranked.map((r) => r._id);
  // Photographer (cross-role, above bar) is included and ranked first.
  assert.equal(ranked[0]._id, 'c-photo');
  assert.equal(ranked[0].appliedHere, false);
  // The weak candidate who APPLIED to this job is kept despite a low score.
  assert.ok(ids.includes('low-applicant'));
  assert.equal(ranked.find((r) => r._id === 'low-applicant').appliedHere, true);
  // An unrelated, below-bar, non-applicant is dropped.
  assert.ok(!ids.includes('barista'));
  // A candidate still awaiting analysis (no skills) is never matched.
  assert.ok(!ids.includes('pending'));
});

// --- Helpers ----------------------------------------------------------------
test('requiredYears parses the free-text experience requirement', () => {
  assert.equal(_requiredYears('2+ Years'), 2);
  assert.equal(_requiredYears('5 years experience'), 5);
  assert.equal(_requiredYears('Freshers'), 0);
  assert.equal(_requiredYears('Entry level'), 0);
  assert.equal(_requiredYears(''), null);
});

test('bandFor buckets scores', () => {
  assert.equal(bandFor(90), 'Strong');
  assert.equal(bandFor(60), 'Good');
  assert.equal(bandFor(45), 'Possible');
  assert.equal(bandFor(20), 'Low');
});

// --- Semantic layer ---------------------------------------------------------
test('cosineSimilarity: identical vectors = 1, orthogonal = 0, guards bad input', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 1], [2, 2]) - 1) < 1e-9); // same direction
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), null);   // length mismatch
  assert.equal(cosineSimilarity([0, 0], [1, 1]), null);      // zero magnitude
  assert.equal(cosineSimilarity(null, [1]), null);
});

test('semanticScore: needs both embeddings and a matching model tag', () => {
  const cand = { embedding: [1, 0, 0], embeddingModel: 'nvidia:x' };
  const job = { embedding: [1, 0, 0], embeddingModel: 'nvidia:x' };
  assert.equal(semanticScore(cand, job).score, 100);
  // Different model tags are never comparable.
  assert.equal(semanticScore(cand, { embedding: [1, 0, 0], embeddingModel: 'openai:y' }), null);
  // Missing embedding → no signal.
  assert.equal(semanticScore({ embeddingModel: 'nvidia:x' }, job), null);
});

test('hybridScore: no weight or no embeddings = plain deterministic score', () => {
  const cand = { skills: ['Sales'], experience: [], projects: [], aiAnalysis: {} };
  const job = { title: 'Sales Lead', requiredSkills: ['Sales'], preferredSkills: [] };
  const det = scoreMatch(cand, job);
  // weight 0 → identical to deterministic
  assert.equal(hybridScore(cand, job, 0).score, det.score);
  // weight > 0 but candidate has no embedding → falls back, annotated semantic:false
  const fb = hybridScore(cand, job, 0.5);
  assert.equal(fb.score, det.score);
  assert.equal(fb.semantic, false);
});

test('hybridScore: a low keyword score is LIFTED by strong semantic similarity', () => {
  // No keyword overlap (job wants "Rust"; candidate lists "Sales"), but the
  // embeddings are identical → semantic should surface this transferable fit.
  const cand = {
    skills: ['Sales'], experience: [], projects: [], aiAnalysis: {},
    embedding: [1, 0, 0], embeddingModel: 'nvidia:x',
  };
  const job = { title: 'Rust Engineer', requiredSkills: ['Rust'], preferredSkills: [], embedding: [1, 0, 0], embeddingModel: 'nvidia:x' };
  const det = scoreMatch(cand, job).score; // weak/zero keyword match
  const h = hybridScore(cand, job, 0.4);
  assert.equal(h.semantic, true);
  assert.equal(h.semanticScore, 100);
  assert.equal(h.deterministicScore, det);
  assert.equal(h.score, Math.round(det * 0.6 + 100 * 0.4));
  assert.ok(h.score > det); // genuinely lifted
});

test('hybridScore is upside-only: weak semantic NEVER demotes a strong keyword match', () => {
  const cand = {
    skills: ['Sales', 'Negotiation'], experience: [], projects: [], aiAnalysis: {},
    embedding: [1, 0, 0], embeddingModel: 'nvidia:x',
  };
  const job = { title: 'Sales Lead', requiredSkills: ['Sales', 'Negotiation'], preferredSkills: [], embedding: [0.2, 0.98, 0], embeddingModel: 'nvidia:x' };
  const det = scoreMatch(cand, job).score; // strong keyword match
  const sem = semanticScore(cand, job).score; // weaker than det
  assert.ok(sem < det);
  const h = hybridScore(cand, job, 0.4);
  assert.equal(h.score, det); // protected — stays at the deterministic score
});
