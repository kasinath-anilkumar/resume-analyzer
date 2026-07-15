// Deterministic candidate <-> job matcher.
//
// Scores how well a candidate fits a job WITHOUT any AI call, so recommendations
// can be computed live on every request and stay free/instant/always-fresh. It
// powers the cross-role recommendation view: a candidate who applied for one
// role but whose résumé aligns with another open role surfaces under that role.
//
// The key to catching transferable fit is that we match a job's skills against
// BOTH the candidate's explicit skill list AND the free text of their
// experience/projects/summary — so "closed photography package sales" on a
// photographer's résumé registers for a Sales role even if "Sales" isn't a
// listed skill.
//
// Pure and side-effect-free -> unit-tested in isolation.

const WEIGHTS = {
  required: 70, // share of the score driven by required-skill coverage
  preferred: 20, // share driven by preferred-skill coverage
  title: 5, // small bonus for job-title keywords appearing in the profile
  experience: 5, // small bonus for meeting the years-of-experience bar
};

// A skill found in the explicit skill list is a stronger signal than one only
// inferred from résumé prose.
const HIT = { list: 1, text: 0.7, listPref: 1, textPref: 0.6 };

const BANDS = [
  { min: 75, band: 'Strong' },
  { min: 55, band: 'Good' },
  { min: 40, band: 'Possible' },
];

// Normalize a token/phrase for comparison: lowercase, keep a few tech-ish chars
// (+ # . for c++, c#, node.js), collapse everything else to spaces.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').replace(/\s+/g, ' ').trim();

const bandFor = (score) => (BANDS.find((b) => score >= b.min) || { band: 'Low' }).band;

// Does `needle` (a normalized job skill) appear within `haystack` (a normalized
// blob or skill)? Uses word-boundary containment so "react" matches "react.js"
// and "react developer" but not "overreacting".
const phraseInText = (needle, text) => {
  if (!needle) return false;
  if (text.includes(needle)) {
    // Guard against substring-inside-a-word false positives for short tokens.
    const re = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
    return re.test(text);
  }
  return false;
};

// Match one job skill against the candidate. Returns 'list' (in the explicit
// skill list), 'text' (only in résumé prose), or null.
const matchSkill = (jobSkill, candSkillsNorm, candTextNorm) => {
  const js = norm(jobSkill);
  if (!js) return null;
  // Explicit skill list: either side containing the other counts (react ~ react.js).
  for (const cs of candSkillsNorm) {
    if (cs === js || (cs.length > 2 && js.includes(cs)) || (js.length > 2 && cs.includes(js))) return 'list';
  }
  if (phraseInText(js, candTextNorm)) return 'text';
  return null;
};

// Build the normalized text blob we search for transferable evidence.
const candidateText = (candidate) => {
  const a = candidate.aiAnalysis || {};
  const parts = [];
  (candidate.skills || []).forEach((s) => parts.push(s));
  (candidate.experience || []).forEach((e) => parts.push(e.title, e.company, e.description));
  (candidate.projects || []).forEach((p) => parts.push(p.title, p.description));
  parts.push(a.careerSummary, a.matchExplanation);
  return norm(parts.filter(Boolean).join(' '));
};

// Extract the first integer from a job's free-text experience requirement,
// e.g. "2+ Years" -> 2, "Freshers" -> 0, "" -> null (no requirement).
const requiredYears = (experience) => {
  const s = String(experience || '');
  if (/fresher|entry|graduate|no experience/i.test(s)) return 0;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

/**
 * Score a single candidate against a single job.
 * @returns {{score:number, band:string, matchedRequired:string[], transferable:string[],
 *            missingRequired:string[], matchedPreferred:string[], reason:string}}
 */
const scoreMatch = (candidate, job) => {
  const candSkillsNorm = (candidate.skills || []).map(norm).filter(Boolean);
  const candText = candidateText(candidate);

  let required = (job.requiredSkills || []).filter(Boolean);
  const preferred = (job.preferredSkills || []).filter(Boolean);
  // Fall back gracefully when a job under-specifies its skills, so the matcher
  // still produces a signal: use preferred, then the job-title keywords.
  let usingFallback = false;
  if (!required.length) {
    if (preferred.length) {
      required = preferred.slice();
    } else {
      required = norm(job.title).split(' ').filter((t) => t.length > 2);
      usingFallback = true;
    }
  }

  const matchedRequired = [];
  const transferable = []; // matched only via résumé prose, not the skill list
  const missingRequired = [];
  let reqPoints = 0;
  for (const skill of required) {
    const hit = matchSkill(skill, candSkillsNorm, candText);
    if (hit === 'list') {
      reqPoints += HIT.list;
      matchedRequired.push(skill);
    } else if (hit === 'text') {
      reqPoints += HIT.text;
      matchedRequired.push(skill);
      transferable.push(skill);
    } else {
      missingRequired.push(skill);
    }
  }
  const reqCoverage = required.length ? reqPoints / required.length : 0;

  const matchedPreferred = [];
  let prefPoints = 0;
  // Only score preferred separately when it wasn't already promoted to required.
  const scorePreferred = job.requiredSkills && job.requiredSkills.length && preferred.length;
  if (scorePreferred) {
    for (const skill of preferred) {
      const hit = matchSkill(skill, candSkillsNorm, candText);
      if (hit === 'list') {
        prefPoints += HIT.listPref;
        matchedPreferred.push(skill);
      } else if (hit === 'text') {
        prefPoints += HIT.textPref;
        matchedPreferred.push(skill);
      }
    }
  }
  const prefCoverage = scorePreferred ? prefPoints / preferred.length : 0;

  // Title keyword bonus (skip when the title already IS the fallback skill set).
  let titleCoverage = 0;
  if (!usingFallback) {
    const titleTokens = norm(job.title).split(' ').filter((t) => t.length > 2);
    if (titleTokens.length) {
      const hits = titleTokens.filter((t) => candSkillsNorm.some((cs) => cs.includes(t)) || phraseInText(t, candText));
      titleCoverage = hits.length / titleTokens.length;
    }
  }

  // Years-of-experience bonus.
  const reqYears = requiredYears(job.experience);
  const candYears = Number(candidate.aiAnalysis?.totalYearsExperience);
  let expBonusRatio = 0;
  if (reqYears != null) {
    if (Number.isFinite(candYears)) expBonusRatio = candYears >= reqYears ? 1 : Math.max(0, candYears / Math.max(reqYears, 1));
    else if ((candidate.experience || []).length) expBonusRatio = 0.5; // has experience, unknown years
  }

  const raw =
    reqCoverage * WEIGHTS.required +
    prefCoverage * WEIGHTS.preferred +
    titleCoverage * WEIGHTS.title +
    expBonusRatio * WEIGHTS.experience;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    band: bandFor(score),
    matchedRequired,
    transferable,
    missingRequired,
    matchedPreferred,
    reason: buildReason({ matchedRequired, missingRequired, transferable, required, usingFallback }),
  };
};

const buildReason = ({ matchedRequired, missingRequired, transferable, required, usingFallback }) => {
  if (usingFallback) {
    return matchedRequired.length
      ? `Profile aligns with the role (${matchedRequired.slice(0, 4).join(', ')})`
      : 'Limited signal — this job lists no required skills.';
  }
  const total = required.length;
  const parts = [`Matches ${matchedRequired.length}/${total} required skills`];
  if (matchedRequired.length) parts[0] += ` (${matchedRequired.slice(0, 4).join(', ')})`;
  if (transferable.length) parts.push(`${transferable.length} inferred from experience`);
  if (missingRequired.length && missingRequired.length <= 4) parts.push(`missing: ${missingRequired.join(', ')}`);
  return parts.join('; ') + '.';
};

// --- Semantic layer (optional) ----------------------------------------------
// Cosine similarity between two equal-length numeric vectors. Returns a number
// in [-1, 1], or null when the vectors are missing, mismatched in length, or
// degenerate (zero magnitude) — callers treat null as "no semantic signal".
const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]); const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

/**
 * Semantic fit of a candidate to a job from their stored embeddings. Returns
 * { sim, score } (score 0–100), or null when either embedding is absent or the
 * two were produced by DIFFERENT models (never comparable). Cosine sits in
 * [-1,1]; real résumé↔job pairs land ~[0,1], so we map [0,1]→[0,100] and clamp.
 */
const semanticScore = (candidate, job) => {
  const cv = candidate && candidate.embedding;
  const jv = job && job.embedding;
  if (!cv || !jv) return null;
  if (candidate.embeddingModel && job.embeddingModel && candidate.embeddingModel !== job.embeddingModel) return null;
  const sim = cosineSimilarity(cv, jv);
  if (sim == null) return null;
  return { sim, score: Math.max(0, Math.min(100, Math.round(sim * 100))) };
};

/**
 * Combined fit: the deterministic keyword score, optionally lifted by the
 * semantic (embedding) score. This is a DISCOVERY tool — the semantic layer
 * exists to SURFACE transferable/cross-role fits that keyword matching misses,
 * so it only ever RAISES a score, never demotes a candidate whose skills already
 * match (final = max(deterministic, blended)). When no semantic signal exists
 * the result is the plain deterministic match (zero behavioural change),
 * annotated semantic:false — so callers can pass semanticWeight freely without
 * regressions.
 */
const hybridScore = (candidate, job, semanticWeight = 0) => {
  const det = scoreMatch(candidate, job);
  if (!semanticWeight) return det;
  const sem = semanticScore(candidate, job);
  if (!sem) return { ...det, semantic: false };
  const w = Math.max(0, Math.min(1, semanticWeight));
  const blended = Math.round(det.score * (1 - w) + sem.score * w);
  // Upside-only: a strong keyword match keeps its score; a weak one gets lifted
  // when the résumé is semantically relevant to the role.
  const finalScore = Math.max(0, Math.min(100, Math.max(det.score, blended)));
  return {
    ...det,
    score: finalScore,
    band: bandFor(finalScore),
    semantic: true,
    semanticScore: sem.score,
    deterministicScore: det.score,
  };
};

/**
 * Rank a pool of candidates against one job by fit.
 * @param candidates array of API-shaped candidates (with skills/experience/aiAnalysis, jobId populated)
 * @param job the target job (API shape)
 * @param opts.min minimum score for a NON-applicant to be recommended (default 40)
 * @param opts.semanticWeight 0–1 blend of embedding similarity into the score (default 0 = deterministic only)
 * @returns array of { ...candidate, appliedHere, match } sorted by match.score desc
 */
const rankPool = (candidates, job, { min = 40, semanticWeight = 0 } = {}) => {
  const jobId = job._id;
  const scored = (candidates || [])
    // Only candidates whose résumé has been parsed can be matched on skills.
    .filter((c) => c.analysisStatus === 'completed' || (c.skills && c.skills.length))
    .map((c) => {
      const appliedJobId = c.jobId && typeof c.jobId === 'object' ? c.jobId._id : c.jobId;
      const appliedHere = String(appliedJobId) === String(jobId);
      return { ...c, appliedHere, match: hybridScore(c, job, semanticWeight) };
    })
    // Keep everyone who applied to THIS job, plus cross-role candidates above the bar.
    .filter((c) => c.appliedHere || c.match.score >= min);

  scored.sort((a, b) => {
    // Applicants outrank equal-scoring non-applicants (they chose this role).
    if (b.match.score !== a.match.score) return b.match.score - a.match.score;
    if (a.appliedHere !== b.appliedHere) return a.appliedHere ? -1 : 1;
    return 0;
  });
  return scored;
};

module.exports = {
  scoreMatch, rankPool, bandFor, cosineSimilarity, semanticScore, hybridScore,
  _norm: norm, _requiredYears: requiredYears,
};
