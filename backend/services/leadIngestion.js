// Meta Lead Ads → candidate ingestion.
//
// For each job mapped to a Meta lead form, pull new leads (since the job's
// per-form cursor), create a candidate per lead (mirroring the manual-add path:
// no résumé yet, source 'Lead', analysis 'completed'), send the résumé-request
// WhatsApp message, and advance the cursor. Idempotent: re-syncing the same lead
// is a no-op (dedup by Meta leadgen id + email/job).

const crypto = require('crypto');
const CandidateRepo = require('../models/candidateRepo');
const JobRepo = require('../models/jobRepo');
const SettingsRepo = require('../models/settingsRepo');
const AuditRepo = require('../models/auditRepo');
const MetaLeads = require('./metaLeadsService');
const WhatsApp = require('./whatsappService');

const appBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '');
  return 'http://localhost:5173';
};

const toUnix = (iso) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : null);
const maxIso = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
};

// Ingest one mapped job's new leads. Returns { created, skipped, whatsapp, newCursor, error? }.
async function ingestForJob(settings, job) {
  const result = { jobId: job._id, title: job.title, created: 0, skipped: 0, whatsapp: 0, newCursor: job.metaLeadCursor || null };
  let leads;
  try {
    leads = await MetaLeads.fetchLeadsSince(settings, job.metaFormId, toUnix(job.metaLeadCursor));
  } catch (err) {
    result.error = err.message;
    return result; // leave the cursor untouched so we retry next poll
  }

  // Oldest → newest so the cursor advances monotonically even if we stop early.
  leads.sort((a, b) => new Date(a.created_time || 0) - new Date(b.created_time || 0));

  for (const raw of leads) {
    result.newCursor = maxIso(result.newCursor, raw.created_time);
    const lead = MetaLeads.mapLeadToCandidate(raw);
    if (!lead.leadMetaId || !lead.email) { result.skipped += 1; continue; }

    // Dedup: same Meta submission, or this email already a candidate for this job.
    try {
      if (await CandidateRepo.findByLeadMetaId(lead.leadMetaId)) { result.skipped += 1; continue; }
      if (await CandidateRepo.existsForJobEmail(job._id, lead.email)) { result.skipped += 1; continue; }
    } catch (dupErr) {
      console.error('[lead] dedup check failed:', dupErr.message);
    }

    const token = crypto.randomBytes(24).toString('hex');
    let candidate;
    try {
      candidate = await CandidateRepo.create({
        name: lead.name || 'Lead (name pending)',
        email: lead.email,
        phone: lead.phone || '',
        resumeUrl: null,                 // no résumé yet — requested via WhatsApp
        jobId: job._id,
        status: 'Applied',
        source: 'Lead',
        screeningAnswers: lead.screeningAnswers,
        analysisStatus: 'completed',     // nothing to analyze until a résumé arrives
        consentAt: lead.createdTime || new Date().toISOString(),
        leadMetaId: lead.leadMetaId,
        resumeUploadToken: token,
        aiAnalysis: {},
      });
    } catch (createErr) {
      console.error('[lead] create failed:', createErr.message);
      result.skipped += 1;
      continue;
    }
    result.created += 1;
    AuditRepo.log(null, 'candidate.create_lead', {
      entityType: 'candidate', entityId: candidate._id,
      summary: `Meta lead → candidate ${candidate.name} for ${job.title}`,
    });

    // Ask for their résumé over WhatsApp (best-effort; self-disables if unconfigured).
    if (lead.phone) {
      const uploadUrl = `${appBaseUrl()}/u/${token}`;
      const wa = await WhatsApp.sendResumeRequest(settings, {
        toPhone: lead.phone, name: lead.name, jobTitle: job.title, uploadUrl,
      });
      if (wa.sent) {
        result.whatsapp += 1;
        await CandidateRepo.markResumeRequested(candidate._id).catch(() => {});
      }
    }
  }
  return result;
}

// Sync every job with a mapped Meta form. Advances each job's cursor + the global
// display timestamp. Returns a summary. Never throws.
async function syncAll(settings) {
  const summary = { jobsSynced: 0, created: 0, skipped: 0, whatsapp: 0, errors: [] };
  if (!MetaLeads.isConfigured(settings)) { summary.skipped = -1; summary.disabled = true; return summary; }

  let jobs = [];
  try {
    jobs = await JobRepo.listWithMetaForm();
  } catch (err) {
    summary.errors.push(err.message);
    return summary;
  }

  for (const job of jobs) {
    const r = await ingestForJob(settings, job);
    summary.jobsSynced += 1;
    summary.created += r.created;
    summary.skipped += r.skipped;
    summary.whatsapp += r.whatsapp;
    if (r.error) summary.errors.push(`${job.title}: ${r.error}`);
    // Persist the advanced cursor only when we actually fetched cleanly.
    if (!r.error && r.newCursor && r.newCursor !== job.metaLeadCursor) {
      await JobRepo.setMetaCursor(job._id, r.newCursor).catch((e) => console.error('[lead] cursor save failed:', e.message));
    }
  }

  await SettingsRepo.update({ metaLastSyncedAt: new Date().toISOString() }).catch(() => {});
  return summary;
}

module.exports = { ingestForJob, syncAll, _appBaseUrl: appBaseUrl };
