const { test } = require('node:test');
const assert = require('node:assert/strict');

// Ensure model defaults are deterministic regardless of the runner's env: these
// env overrides, if present, would change defaultModel()'s output.
for (const k of ['OPENAI_MODEL', 'CLAUDE_MODEL', 'GEMINI_MODEL', 'NVIDIA_NIM_MODEL']) delete process.env[k];

const AIService = require('../services/aiService');

// --- cleanKey ---------------------------------------------------------------
test('cleanKey strips zero-width chars, wrapping quotes, and whitespace', () => {
  assert.equal(AIService.cleanKey('  "sk-abc"  '), 'sk-abc');
  assert.equal(AIService.cleanKey('`nvapi-x`'), 'nvapi-x');
  assert.equal(AIService.cleanKey('​sk-zero﻿'), 'sk-zero');
  assert.equal(AIService.cleanKey(null), '');
  assert.equal(AIService.cleanKey(42), '');
});

// --- detectProvider ---------------------------------------------------------
test('detectProvider maps key prefixes to providers (order matters)', () => {
  assert.equal(AIService.detectProvider('sk-ant-abc123'), 'claude'); // before generic sk-
  assert.equal(AIService.detectProvider('nvapi-abc'), 'nvidia');
  assert.equal(AIService.detectProvider('AIzaSyXXXX'), 'gemini');
  assert.equal(AIService.detectProvider('AQ.abcdef'), 'gemini');
  assert.equal(AIService.detectProvider('sk-proj-abc'), 'openai');
  assert.equal(AIService.detectProvider('sk-abc'), 'openai');
  assert.equal(AIService.detectProvider('total-nonsense'), null);
  assert.equal(AIService.detectProvider(''), null);
  // Copy-paste noise is cleaned before detection.
  assert.equal(AIService.detectProvider('  "sk-ant-quoted" '), 'claude');
});

// --- extractJson ------------------------------------------------------------
test('extractJson parses plain, fenced, and prose-wrapped JSON', () => {
  assert.deepEqual(AIService.extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(AIService.extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(AIService.extractJson('```\n{"b":2}\n```'), { b: 2 });
  assert.deepEqual(AIService.extractJson('Sure! Here it is: {"c":3} — cheers'), { c: 3 });
});

test('extractJson throws on empty and on non-JSON text', () => {
  assert.throws(() => AIService.extractJson(''), /Empty AI response/);
  assert.throws(() => AIService.extractJson(null), /Empty AI response/);
  assert.throws(() => AIService.extractJson('no json here'));
});

// --- modelMatchesProvider / resolveModel ------------------------------------
test('modelMatchesProvider recognizes each provider family', () => {
  assert.equal(AIService.modelMatchesProvider('gemini', 'gemini-2.0-flash'), true);
  assert.equal(AIService.modelMatchesProvider('gemini', 'gemma-2'), true);
  assert.equal(AIService.modelMatchesProvider('gemini', 'gpt-4o'), false);
  assert.equal(AIService.modelMatchesProvider('openai', 'gpt-4o-mini'), true);
  assert.equal(AIService.modelMatchesProvider('openai', 'o3-mini'), true);
  assert.equal(AIService.modelMatchesProvider('claude', 'claude-opus-4-8'), true);
  assert.equal(AIService.modelMatchesProvider('nvidia', 'meta/llama-3.1-70b-instruct'), true);
  assert.equal(AIService.modelMatchesProvider('nvidia', 'llama'), false); // needs a namespace slash
  assert.equal(AIService.modelMatchesProvider('openai', ''), false);
});

test('resolveModel keeps a matching model, else falls back to the provider default', () => {
  assert.equal(AIService.resolveModel('gemini', 'gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(AIService.resolveModel('gemini', 'gpt-4o'), 'gemini-2.0-flash'); // mismatch -> default
  assert.equal(AIService.resolveModel('openai', null), 'gpt-4o-mini');
  assert.equal(AIService.resolveModel('nvidia', ''), 'meta/llama-3.1-70b-instruct');
});

// --- deriveVerdict ----------------------------------------------------------
test('deriveVerdict bands the overall score', () => {
  assert.equal(AIService.deriveVerdict(80), 'Strong Fit');
  assert.equal(AIService.deriveVerdict(79), 'Potential Fit');
  assert.equal(AIService.deriveVerdict(65), 'Potential Fit');
  assert.equal(AIService.deriveVerdict(64), 'Weak Fit');
  assert.equal(AIService.deriveVerdict(45), 'Weak Fit');
  assert.equal(AIService.deriveVerdict(44), 'Not a Fit');
  assert.equal(AIService.deriveVerdict(0), 'Not a Fit');
  assert.equal(AIService.deriveVerdict(undefined), 'Not a Fit');
});

// --- normalizeAnalysis ------------------------------------------------------
test('normalizeAnalysis clamps scores, coerces arrays, and repairs enums', () => {
  const out = AIService.normalizeAnalysis({
    aiAnalysis: {
      overallScore: 150,
      technicalScore: -5,
      confidence: undefined,
      strengths: 'not-an-array',
      matchedSkills: ['a', 2, ''],
      redFlags: [{ type: 'Gap' }, { detail: 'd' }, {}, 'bad'],
      screeningVerdict: 'bogus',
      seniorityLevel: 'Senior',
      totalYearsExperience: '-3',
    },
  });
  const a = out.aiAnalysis;
  assert.equal(a.overallScore, 100); // clamped high
  assert.equal(a.technicalScore, 0); // clamped low
  assert.equal(a.confidence, 70); // default when missing
  assert.deepEqual(a.strengths, []); // non-array -> []
  assert.deepEqual(a.matchedSkills, ['a', '2']); // stringified, blanks dropped
  assert.deepEqual(a.redFlags, [
    { type: 'Gap', detail: '' },
    { type: 'Other', detail: 'd' },
  ]); // entries without type/detail are dropped
  assert.equal(a.screeningVerdict, 'Strong Fit'); // derived from overallScore=100
  assert.equal(a.seniorityLevel, 'Senior');
  assert.equal(a.totalYearsExperience, null); // negative -> null
});

test('normalizeAnalysis fills defaults when aiAnalysis is absent', () => {
  const out = AIService.normalizeAnalysis({});
  assert.equal(out.aiAnalysis.overallScore, 0);
  assert.equal(out.aiAnalysis.confidence, 70);
  assert.equal(out.aiAnalysis.screeningVerdict, 'Not a Fit');
  assert.equal(out.aiAnalysis.seniorityLevel, '');
});

test('normalizeAnalysis returns non-object input untouched', () => {
  assert.equal(AIService.normalizeAnalysis(null), null);
  assert.equal(AIService.normalizeAnalysis('x'), 'x');
});

// --- filterUsableModels -----------------------------------------------------
test('filterUsableModels drops non-text models and dedupes', () => {
  assert.deepEqual(
    AIService.filterUsableModels('gemini', ['gemini-2.0-flash', 'imagen-3', 'gemini-embedding-001', 'veo-2']),
    ['gemini-2.0-flash']
  );
  assert.deepEqual(
    AIService.filterUsableModels('openai', ['gpt-4o', 'gpt-4o', 'whisper-1', 'text-embedding-3-small']),
    ['gpt-4o']
  );
  // Claude has no exclusion list — everything passes (still deduped).
  assert.deepEqual(AIService.filterUsableModels('claude', ['claude-a', 'claude-a', 'claude-b']), ['claude-a', 'claude-b']);
  assert.deepEqual(AIService.filterUsableModels('gemini', null), []);
});

// --- normalizeExtractedJob --------------------------------------------------
test('normalizeExtractedJob enforces a safe, schema-valid shape', () => {
  const out = AIService.normalizeExtractedJob({
    title: '  Sales Associate  ',
    employmentType: 'Freelance', // not allowed -> Full-time
    numberOpenings: '0', // < 1 -> 1
    requiredSkills: 'Selling, CRM',
    preferredSkills: ['Upselling', ''],
  });
  assert.equal(out.title, 'Sales Associate');
  assert.equal(out.employmentType, 'Full-time');
  assert.equal(out.numberOpenings, 1);
  assert.deepEqual(out.requiredSkills, ['Selling', 'CRM']);
  assert.deepEqual(out.preferredSkills, ['Upselling']);

  const kept = AIService.normalizeExtractedJob({ employmentType: 'Contract', numberOpenings: 3 });
  assert.equal(kept.employmentType, 'Contract');
  assert.equal(kept.numberOpenings, 3);

  const empty = AIService.normalizeExtractedJob({});
  assert.equal(empty.title, '');
  assert.equal(empty.employmentType, 'Full-time');
  assert.equal(empty.numberOpenings, 1);
  assert.deepEqual(empty.requiredSkills, []);
});

// --- providerError ----------------------------------------------------------
const fakeErr = (status, message = 'boom') => ({ response: { status, data: { error: { message } } }, message });

test('providerError classifies HTTP failures into friendly, coded errors', () => {
  const invalid = AIService.providerError(fakeErr(401), 'openai');
  assert.equal(invalid.code, 'AI_KEY_INVALID');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.aiClassified, true);

  assert.equal(AIService.providerError(fakeErr(403), 'gemini').code, 'AI_KEY_INVALID');
  assert.equal(AIService.providerError(fakeErr(400, 'invalid api key'), 'openai').code, 'AI_KEY_INVALID');

  const rate = AIService.providerError(fakeErr(429), 'nvidia');
  assert.equal(rate.code, 'AI_RATE_LIMIT');
  assert.equal(rate.status, 429);

  const failed = AIService.providerError(fakeErr(500), 'claude');
  assert.equal(failed.code, 'AI_FAILED');
  assert.equal(failed.status, 502);
});

test('providerError surfaces the gemini zero-quota hint', () => {
  const e = AIService.providerError(fakeErr(429, 'Quota exceeded (limit: 0)'), 'gemini');
  assert.equal(e.code, 'AI_RATE_LIMIT');
  assert.match(e.message, /no free-tier quota/i);
});

// --- resolveKeyProvider (env-sensitive) -------------------------------------
test('resolveKeyProvider prefers an app-configured key and auto-detects its provider', () => {
  assert.deepEqual(AIService.resolveKeyProvider({ apiKey: 'nvapi-xyz ' }), {
    apiKey: 'nvapi-xyz',
    provider: 'nvidia',
  });
  assert.deepEqual(AIService.resolveKeyProvider({ apiKey: 'sk-ant-xyz' }), {
    apiKey: 'sk-ant-xyz',
    provider: 'claude',
  });
});

test('resolveKeyProvider trusts an explicit provider when the key shape is unknown', () => {
  const r = AIService.resolveKeyProvider({ apiKey: 'custom-key', provider: 'openai' });
  assert.equal(r.provider, 'openai');
  assert.equal(r.apiKey, 'custom-key');
});

test('resolveKeyProvider falls back to environment configuration', () => {
  const saved = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
  };
  process.env.AI_PROVIDER = 'nvidia';
  process.env.NVIDIA_API_KEY = 'env-nvidia-key';
  try {
    assert.deepEqual(AIService.resolveKeyProvider({}), { apiKey: 'env-nvidia-key', provider: 'nvidia' });
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
});

test('resolveKeyProvider throws a coded error when nothing usable is configured', () => {
  const saved = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
  };
  for (const k of Object.keys(saved)) delete process.env[k];
  try {
    assert.throws(() => AIService.resolveKeyProvider({}), (err) => {
      assert.equal(err.code, 'AI_NOT_CONFIGURED');
      assert.equal(err.status, 503);
      return true;
    });
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
});
