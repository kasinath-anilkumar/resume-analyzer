// Embedding service — turns candidate/job text into vectors for semantic matching.
//
// Uses whichever AI provider is configured in Settings (same key the résumé
// analyzer uses). It is fully OPTIONAL and self-disabling: if the provider is
// 'mock', no key is set, or the embedding call fails, embed() returns null and
// the recommendation engine silently falls back to the deterministic matcher —
// so semantic matching never breaks the core flow on a flaky free tier.
//
// Vectors are stored as plain JSON float arrays (not pgvector), so switching
// providers (whose dimensions differ: NVIDIA 1024, OpenAI 1536, Gemini 768)
// never needs a schema migration. Each vector is tagged with the model that
// produced it; only same-tag vectors are ever compared (see candidateMatcher).

const axios = require('axios');
// SettingsRepo is lazy-required inside resolveConfig() so the pure text builders
// (buildCandidateText/buildJobText) can be imported without pulling in the DB
// client — keeps the unit tests and CI free of Supabase config.

// Per-provider embedding endpoint + default model. NVIDIA's nv-embedqa model is
// ASYMMETRIC: pass input_type 'query' for the job (the "question") and 'passage'
// for the candidate (the "document") — that is how the model was trained.
const PROVIDERS = {
  nvidia: { model: 'nvidia/nv-embedqa-e5-v5', tag: 'nvidia:nv-embedqa-e5-v5' },
  openai: { model: 'text-embedding-3-small', tag: 'openai:text-embedding-3-small' },
  gemini: { model: 'text-embedding-004', tag: 'gemini:text-embedding-004' },
};

const MAX_CHARS = 8000; // cap payload; the models truncate long input anyway
const BATCH = 32;        // keep request bodies modest for free-tier stability

const clip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Resolve the live provider + key from Settings (cached briefly to avoid a DB
// round-trip on every embed in a backfill loop).
let _cfg = null;
let _cfgAt = 0;
async function resolveConfig() {
  const now = Date.now();
  if (_cfg && now - _cfgAt < 30000) return _cfg;
  const SettingsRepo = require('../models/settingsRepo');
  const s = await SettingsRepo.get();
  _cfg = { provider: s.aiProvider, apiKey: s.aiApiKey };
  _cfgAt = now;
  return _cfg;
}

// The model tag that WOULD be used given the current config, or null if disabled.
async function currentTag() {
  const { provider, apiKey } = await resolveConfig();
  const p = PROVIDERS[provider];
  return p && apiKey ? p.tag : null;
}

async function isAvailable() {
  return Boolean(await currentTag());
}

// --- provider calls (each returns an array of vectors aligned to `texts`) -----

async function embedNvidia(texts, model, apiKey, inputType) {
  const out = [];
  for (const group of chunk(texts, BATCH)) {
    const r = await axios.post(
      'https://integrate.api.nvidia.com/v1/embeddings',
      { input: group, model, input_type: inputType === 'query' ? 'query' : 'passage', encoding_format: 'float', truncate: 'END' },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    (r.data?.data || []).forEach((d) => out.push(d.embedding));
  }
  return out;
}

async function embedOpenai(texts, model, apiKey) {
  const out = [];
  for (const group of chunk(texts, BATCH)) {
    const r = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { input: group, model, encoding_format: 'float' },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    (r.data?.data || []).forEach((d) => out.push(d.embedding));
  }
  return out;
}

async function embedGemini(texts, model, apiKey, inputType) {
  // Gemini exposes batchEmbedContents; task type improves retrieval quality.
  const taskType = inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
  const out = [];
  for (const group of chunk(texts, BATCH)) {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`,
      { requests: group.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] }, taskType })) },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    (r.data?.embeddings || []).forEach((e) => out.push(e.values));
  }
  return out;
}

/**
 * Embed one or more texts. Returns { model, vectors } or null when unavailable
 * or on any failure (caller falls back to deterministic matching).
 * @param {string|string[]} input
 * @param {{ inputType?: 'query'|'passage' }} [opts]
 */
async function embed(input, opts = {}) {
  const texts = (Array.isArray(input) ? input : [input]).map(clip).filter(Boolean);
  if (!texts.length) return null;
  try {
    const { provider, apiKey } = await resolveConfig();
    const p = PROVIDERS[provider];
    if (!p || !apiKey) return null; // mock / unconfigured → semantic disabled

    let vectors;
    if (provider === 'nvidia') vectors = await embedNvidia(texts, p.model, apiKey, opts.inputType);
    else if (provider === 'openai') vectors = await embedOpenai(texts, p.model, apiKey);
    else if (provider === 'gemini') vectors = await embedGemini(texts, p.model, apiKey, opts.inputType);
    else return null;

    if (!vectors || vectors.length !== texts.length || !Array.isArray(vectors[0])) return null;
    return { model: p.tag, vectors };
  } catch (err) {
    console.error('[embedding] failed:', err.response?.status || '', (err.response?.data?.detail || err.message || '').toString().slice(0, 140));
    return null;
  }
}

// Embed a single text; returns { model, vector } or null.
async function embedOne(input, opts = {}) {
  const res = await embed(input, opts);
  return res ? { model: res.model, vector: res.vectors[0] } : null;
}

// --- text construction (PURE — unit-tested) ---------------------------------
// Deliberately name/contact-free: matching is on skills & experience only, never
// personal attributes (consistent with the analyzer's fairness rule).

function buildCandidateText(candidate = {}) {
  const a = candidate.aiAnalysis || {};
  const parts = [];
  if (a.seniorityLevel) parts.push(`Seniority: ${a.seniorityLevel}.`);
  if (a.totalYearsExperience != null) parts.push(`${a.totalYearsExperience} years experience.`);
  if ((candidate.skills || []).length) parts.push(`Skills: ${candidate.skills.join(', ')}.`);
  (candidate.experience || []).forEach((e) => {
    parts.push([e.title, e.company].filter(Boolean).join(' at '));
    if (e.description) parts.push(e.description);
  });
  (candidate.projects || []).forEach((p) => parts.push([p.title, p.description].filter(Boolean).join(': ')));
  if (a.careerSummary) parts.push(a.careerSummary);
  return clip(parts.filter(Boolean).join(' '));
}

function buildJobText(job = {}) {
  const parts = [];
  if (job.title) parts.push(`Role: ${job.title}.`);
  if (job.department) parts.push(`Department: ${job.department}.`);
  if ((job.requiredSkills || []).length) parts.push(`Required skills: ${job.requiredSkills.join(', ')}.`);
  if ((job.preferredSkills || []).length) parts.push(`Preferred skills: ${job.preferredSkills.join(', ')}.`);
  if (job.experience) parts.push(`Experience: ${job.experience}.`);
  if (job.description) parts.push(job.description);
  return clip(parts.filter(Boolean).join(' '));
}

// Convenience wrappers: build the right text + embed with the right input_type.
// A candidate is a "passage" (document), a job is a "query" (what we search for).
// Return { vector, model } or null.
async function embedCandidate(candidate) {
  const text = buildCandidateText(candidate);
  if (!text) return null;
  return embedOne(text, { inputType: 'passage' });
}
async function embedJob(job) {
  const text = buildJobText(job);
  if (!text) return null;
  return embedOne(text, { inputType: 'query' });
}

module.exports = {
  embed, embedOne, embedCandidate, embedJob, isAvailable, currentTag,
  buildCandidateText, buildJobText, PROVIDERS, _clip: clip,
};
