// Recruiter analytics — PURE aggregation over the candidate + job pools.
//
// Kept dependency-free and side-effect-free (like quizScoring / candidateMatcher /
// applicantView) so it is trivially unit-testable and cheap to run live on read.
// The controller fetches the pools and passes them in; nothing here touches the DB.
//
// Input shapes (already mapped to the API camelCase by the repos):
//   candidates: [{ _id, jobId, status, source, overallScore, screeningVerdict,
//                  seniorityLevel, quizScore, analysisStatus, createdAt, updatedAt }]
//   jobs:       [{ _id, title, department, status }]

const PIPELINE_STAGES = [
  'Applied', 'Screening', 'Shortlisted', 'Interview',
  'Technical Round', 'HR Round', 'Offer', 'Hired', 'Rejected',
];

// Stages at/after "reached shortlist" — a candidate moved to Interview is no
// longer in the 'Shortlisted' status but HAS passed that gate. Cumulative gates
// power the honest conversion funnel (matches getDashboardStats' shortlistReached).
const REACHED = {
  shortlist: ['Shortlisted', 'Interview', 'Technical Round', 'HR Round', 'Offer', 'Hired'],
  interview: ['Interview', 'Technical Round', 'HR Round', 'Offer', 'Hired'],
  offer: ['Offer', 'Hired'],
  hired: ['Hired'],
};

const VERDICTS = ['Strong Fit', 'Potential Fit', 'Weak Fit', 'Not a Fit'];
const SENIORITY = ['Intern', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal'];
const QUIZ_PASS_MARK = 60;

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0); // 1-dp %
const avg = (nums) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0);
const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
};
const isReached = (status, gate) => REACHED[gate].includes(status);

/**
 * Compute the full recruiter analytics bundle.
 * @param {Array} candidates
 * @param {Array} jobs
 * @param {{ now?: number }} [opts]  now = ms epoch (injectable for tests)
 */
function computeAnalytics(candidates = [], jobs = [], opts = {}) {
  const now = opts.now || Date.now();
  const cands = Array.isArray(candidates) ? candidates : [];
  const jobList = Array.isArray(jobs) ? jobs : [];

  const analyzed = cands.filter((c) => Number(c.overallScore) > 0);
  const scores = analyzed.map((c) => Number(c.overallScore));

  // ---- headline KPIs -------------------------------------------------------
  const hiredCands = cands.filter((c) => c.status === 'Hired');
  const totals = {
    totalCandidates: cands.length,
    analyzedCount: analyzed.length,
    totalJobs: jobList.length,
    activeJobs: jobList.filter((j) => j.status === 'Active').length,
    avgScore: avg(scores),
    hiredCount: hiredCands.length,
  };

  // ---- conversion funnel (cumulative gates + step-over-step rates) ---------
  const applied = cands.length; // every candidate has applied/entered the pipeline
  const gate = {
    applied,
    shortlisted: cands.filter((c) => isReached(c.status, 'shortlist')).length,
    interviewed: cands.filter((c) => isReached(c.status, 'interview')).length,
    offered: cands.filter((c) => isReached(c.status, 'offer')).length,
    hired: cands.filter((c) => isReached(c.status, 'hired')).length,
    rejected: cands.filter((c) => c.status === 'Rejected').length,
  };
  const conversion = [
    { from: 'Applied', to: 'Shortlisted', count: gate.shortlisted, base: gate.applied, rate: pct(gate.shortlisted, gate.applied) },
    { from: 'Shortlisted', to: 'Interview', count: gate.interviewed, base: gate.shortlisted, rate: pct(gate.interviewed, gate.shortlisted) },
    { from: 'Interview', to: 'Offer', count: gate.offered, base: gate.interviewed, rate: pct(gate.offered, gate.interviewed) },
    { from: 'Offer', to: 'Hired', count: gate.hired, base: gate.offered, rate: pct(gate.hired, gate.offered) },
  ];
  const funnel = PIPELINE_STAGES.map((stage) => ({
    name: stage,
    value: cands.filter((c) => c.status === stage).length,
  }));

  // ---- source effectiveness (Application vs Manual vs anything else) --------
  const sourceNames = [...new Set(cands.map((c) => c.source || 'Manual'))];
  const sourceEffectiveness = sourceNames.map((name) => {
    const group = cands.filter((c) => (c.source || 'Manual') === name);
    const gScores = group.filter((c) => Number(c.overallScore) > 0).map((c) => Number(c.overallScore));
    return {
      source: name,
      count: group.length,
      avgScore: avg(gScores),
      shortlistRate: pct(group.filter((c) => isReached(c.status, 'shortlist')).length, group.length),
      hireRate: pct(group.filter((c) => c.status === 'Hired').length, group.length),
    };
  }).sort((a, b) => b.count - a.count);

  // ---- AI verdict distribution --------------------------------------------
  const verdictDistribution = VERDICTS.map((v) => ({
    name: v,
    value: cands.filter((c) => c.screeningVerdict === v).length,
  }));
  const unscored = cands.filter((c) => !VERDICTS.includes(c.screeningVerdict)).length;
  if (unscored > 0) verdictDistribution.push({ name: 'Unscored', value: unscored });

  // ---- score histogram (analyzed only) ------------------------------------
  const buckets = [
    { name: '0–39', min: 0, max: 39 },
    { name: '40–54', min: 40, max: 54 },
    { name: '55–69', min: 55, max: 69 },
    { name: '70–84', min: 70, max: 84 },
    { name: '85–100', min: 85, max: 100 },
  ];
  const scoreHistogram = buckets.map((b) => ({
    name: b.name,
    value: scores.filter((s) => s >= b.min && s <= b.max).length,
  }));

  // ---- seniority mix -------------------------------------------------------
  const seniorityMix = SENIORITY.map((level) => ({
    name: level,
    value: cands.filter((c) => c.seniorityLevel === level).length,
  })).filter((s) => s.value > 0);

  // ---- quiz / assessment stats --------------------------------------------
  const quizTaken = cands.filter((c) => c.quizScore !== null && c.quizScore !== undefined && !Number.isNaN(Number(c.quizScore)));
  const quizScores = quizTaken.map((c) => Number(c.quizScore));
  const quizStats = {
    taken: quizTaken.length,
    completionRate: pct(quizTaken.length, cands.length),
    avgScore: avg(quizScores),
    passRate: pct(quizScores.filter((s) => s >= QUIZ_PASS_MARK).length, quizScores.length),
    passMark: QUIZ_PASS_MARK,
  };

  // ---- time-to-hire (APPROXIMATE) -----------------------------------------
  // No status-transition history exists, so we approximate the hire duration as
  // (updatedAt - createdAt) for Hired candidates. Any later edit to a hired row
  // inflates this, so it is surfaced in the UI as an approximation, not a SLA.
  const hireDays = hiredCands
    .map((c) => {
      const created = c.createdAt ? new Date(c.createdAt).getTime() : null;
      const updated = c.updatedAt ? new Date(c.updatedAt).getTime() : null;
      if (!created || !updated || updated < created) return null;
      return Math.round(((updated - created) / (1000 * 60 * 60 * 24)) * 10) / 10;
    })
    .filter((d) => d !== null);
  const timeToHire = {
    approximate: true,
    sample: hireDays.length,
    avgDays: avg(hireDays),
    medianDays: median(hireDays),
  };

  // ---- per-job performance table ------------------------------------------
  const perJob = jobList.map((job) => {
    const group = cands.filter((c) => String(c.jobId) === String(job._id));
    const gScores = group.filter((c) => Number(c.overallScore) > 0).map((c) => Number(c.overallScore));
    return {
      jobId: job._id,
      title: job.title,
      department: job.department,
      status: job.status,
      applications: group.length,
      avgScore: avg(gScores),
      shortlistRate: pct(group.filter((c) => isReached(c.status, 'shortlist')).length, group.length),
      interviews: group.filter((c) => isReached(c.status, 'interview')).length,
      hires: group.filter((c) => c.status === 'Hired').length,
    };
  }).sort((a, b) => b.applications - a.applications);

  // ---- applications-over-time (last 6 months, per-month apps vs hires) -----
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const applicationsOverTime = [];
  const ref = new Date(now);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
    const inMonth = (ts) => {
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return t >= start && t <= end;
    };
    applicationsOverTime.push({
      month: monthLabels[d.getMonth()],
      Applications: cands.filter((c) => inMonth(c.createdAt)).length,
      Hired: cands.filter((c) => c.status === 'Hired' && inMonth(c.updatedAt)).length,
    });
  }

  return {
    totals,
    conversion,
    funnel,
    sourceEffectiveness,
    verdictDistribution,
    scoreHistogram,
    seniorityMix,
    quizStats,
    timeToHire,
    perJob,
    applicationsOverTime,
  };
}

module.exports = { computeAnalytics, PIPELINE_STAGES, VERDICTS, SENIORITY, QUIZ_PASS_MARK };
