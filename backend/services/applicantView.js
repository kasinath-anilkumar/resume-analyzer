// Applicant-facing view layer for the careers portal.
//
// Recruiter data (AI scores, red flags, recruiter notes, quiz answer keys, other
// applicants' info) must NEVER reach an applicant. These serializers are the one
// gate the portal controllers pass candidate rows through — they whitelist only
// safe fields and translate internal pipeline statuses into applicant-friendly
// wording. Pure + unit-tested.

// Internal pipeline status -> what the applicant is shown.
const PUBLIC_STATUS = {
  Applied: 'Application Received',
  Screening: 'Under Review',
  Shortlisted: 'Shortlisted',
  Interview: 'Interview Stage',
  'Technical Round': 'Interview Stage',
  'HR Round': 'Interview Stage',
  Offer: 'Offer Extended',
  Hired: 'Hired',
  Rejected: 'Not Selected',
};

const publicStatus = (status) => PUBLIC_STATUS[status] || 'Application Received';

// Where the application sits on the applicant timeline, plus the outcome tone.
const STAGE_INDEX = {
  Applied: 0,
  Screening: 1,
  Shortlisted: 1,
  Interview: 2,
  'Technical Round': 2,
  'HR Round': 2,
  Offer: 3,
  Hired: 3,
  Rejected: 3,
};

const stageOf = (status) => {
  const index = STAGE_INDEX[status] ?? 0;
  const outcome = status === 'Hired' || status === 'Offer' ? 'positive' : status === 'Rejected' ? 'negative' : 'pending';
  return { index, outcome };
};

const TIMELINE = ['Application Received', 'Under Review', 'Interview', 'Decision'];

// An applicant may withdraw an application that is still open (not already
// decided or withdrawn). The recruiter closes it as 'Rejected' under the hood,
// but withdrawnAt is what the portal keys off — so the applicant sees "Withdrawn"
// rather than "Not Selected".
const isWithdrawn = (c) => Boolean(c && c.withdrawnAt);
const canWithdraw = (c) => !isWithdrawn(c) && !['Hired', 'Rejected'].includes(c && c.status);

const safeJob = (job) => {
  if (!job || typeof job !== 'object') return { title: 'A role' };
  return {
    _id: job._id,
    title: job.title,
    department: job.department || '',
    location: job.location || '',
    employmentType: job.employmentType || '',
    ...(job.description ? { description: job.description } : {}),
  };
};

// Scheduling details only — never the recruiter's private interview notes.
const safeInterviews = (interviews) =>
  (Array.isArray(interviews) ? interviews : [])
    .map((i) => ({
      stage: i.stage || 'Interview',
      scheduledAt: i.scheduledAt || null,
      mode: i.mode || '',
      locationOrLink: i.locationOrLink || '',
      interviewer: i.interviewer || '',
    }))
    .sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')));

// List-card shape.
const toApplicantView = (c) => {
  if (!c) return null;
  const withdrawn = isWithdrawn(c);
  const { index, outcome } = stageOf(c.status);
  const interviews = safeInterviews(c.interviews);
  return {
    _id: c._id,
    job: safeJob(c.jobId),
    appliedAt: c.createdAt,
    status: withdrawn ? 'Withdrawn' : publicStatus(c.status),
    stageIndex: index,
    outcome: withdrawn ? 'negative' : outcome,
    withdrawn,
    withdrawnAt: withdrawn ? c.withdrawnAt : null,
    canWithdraw: canWithdraw(c),
    nextInterviewAt: withdrawn || !interviews.length ? null : interviews[interviews.length - 1].scheduledAt,
  };
};

// Detail shape — role description, the full (sanitized) interview list, timeline.
const toApplicantDetail = (c) => {
  if (!c) return null;
  const withdrawn = isWithdrawn(c);
  const { index, outcome } = stageOf(c.status);
  const negativeOutcome = withdrawn || outcome === 'negative';
  return {
    ...toApplicantView(c),
    interviews: withdrawn ? [] : safeInterviews(c.interviews),
    timeline: TIMELINE.map((label, i) => ({
      label,
      done: negativeOutcome ? i < index : i <= index,
      current: i === index,
    })),
  };
};

module.exports = { publicStatus, stageOf, toApplicantView, toApplicantDetail, isWithdrawn, canWithdraw, PUBLIC_STATUS, TIMELINE };
