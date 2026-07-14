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

/**
 * Rank a pool of candidates against one job by fit.
 * @param candidates array of API-shaped candidates (with skills/experience/aiAnalysis, jobId populated)
 * @param job the target job (API shape)
 * @param opts.min minimum score for a NON-applicant to be recommended (default 40)
 * @returns array of { ...candidate, appliedHere, match } sorted by match.score desc
 */
const rankPool = (candidates, job, { min = 40 } = {}) => {
  const jobId = job._id;
  const scored = (candidates || [])
    // Only candidates whose résumé has been parsed can be matched on skills.
    .filter((c) => c.analysisStatus === 'completed' || (c.skills && c.skills.length))
    .map((c) => {
      const appliedJobId = c.jobId && typeof c.jobId === 'object' ? c.jobId._id : c.jobId;
      const appliedHere = String(appliedJobId) === String(jobId);
      return { ...c, appliedHere, match: scoreMatch(c, job) };
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

module.exports = { scoreMatch, rankPool, bandFor, _norm: norm, _requiredYears: requiredYears };
