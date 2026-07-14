const CandidateRepo = require('../models/candidateRepo');
const JobRepo = require('../models/jobRepo');
const SettingsRepo = require('../models/settingsRepo');
const ParserService = require('./parserService');
const AIService = require('./aiService');
const StorageService = require('./storageService');

// In-process background worker that drains the résumé-analysis queue. Uploads
// enqueue a candidate with analysis_status='pending' and return instantly; this
// loop claims each pending candidate, downloads + parses the résumé, runs AI
// analysis, and stores the result — off the web request thread. On a single
// Render instance this keeps OCR/AI/rate-limit latency out of every upload.
let running = false;
let timer = null;
const IDLE_MS = 3000;

const resolveAiConfig = async () => {
  try {
    const s = await SettingsRepo.get();
    return { apiKey: s.aiApiKey, provider: s.aiProvider, model: s.aiModel };
  } catch (_) {
    return {};
  }
};

async function processOne(row) {
  const id = row.id;
  try {
    const job = await JobRepo.findById(row.job_id);
    if (!job) return CandidateRepo.failAnalysis(id, 'Job not found for analysis.');

    const file = await StorageService.downloadResume(row.resume_url);
    const text = await ParserService.extractText(file.buffer, file.mimeType, file.originalName);
    if (!text || !text.replace(/\s/g, '').length) {
      return CandidateRepo.failAnalysis(id, 'Could not read any text from the résumé.');
    }

    const parsed = await AIService.analyzeResume(text, job, await resolveAiConfig());
    // Applicants entered their own name/email/phone on the apply form — those are
    // authoritative and must NOT be overwritten by whatever the résumé parser
    // reads (a résumé can carry a different name). Manual recruiter uploads keep
    // the AI-filled identity (they start from placeholders).
    const isApplication = row.source === 'Application';
    await CandidateRepo.completeAnalysis(id, parsed, {
      preserveName: isApplication,
      preserveEmail: isApplication,
      preservePhone: isApplication && Boolean(row.phone),
    });
    console.log('[worker] analyzed candidate', id);
  } catch (err) {
    console.error('[worker] analysis failed for', id, '-', err.message);
    await CandidateRepo.failAnalysis(id, err.message || 'Analysis failed').catch(() => {});
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    let claimed;
    // Drain the queue one at a time (keeps memory/CPU bounded on small hosts).
    // eslint-disable-next-line no-cond-assign
    while ((claimed = await CandidateRepo.claimNextPending())) {
      await processOne(claimed);
    }
  } catch (err) {
    console.error('[worker] tick error:', err.message);
  } finally {
    running = false;
    schedule();
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, IDLE_MS);
  if (timer.unref) timer.unref();
}

// --- GDPR data retention -----------------------------------------------------
// Periodically purge candidates older than the configured retention window
// (Settings → Data & Privacy). Off by default (retentionDays = 0). 'Hired'
// candidates are always kept. Résumé files are removed too.
const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let retentionTimer = null;

async function runRetention() {
  try {
    const s = await SettingsRepo.get();
    const days = s.retentionDays || 0;
    if (days > 0) {
      const removed = await CandidateRepo.purgeOlderThan(days);
      if (removed.length) {
        console.log(`[retention] purged ${removed.length} candidate(s) older than ${days} days`);
        for (const r of removed) await StorageService.deleteResume(r.resumeUrl).catch(() => {});
      }
    }

    // Auto-empty Trash: permanently purge candidates trashed > 30 days ago
    // (independent of the configurable retention window).
    const purgedTrash = await CandidateRepo.purgeTrashedOlderThan(30);
    if (purgedTrash.length) {
      console.log(`[retention] emptied ${purgedTrash.length} trashed candidate(s) older than 30 days`);
      for (const r of purgedTrash) await StorageService.deleteResume(r.resumeUrl).catch(() => {});
    }
  } catch (err) {
    console.error('[retention] failed:', err.message);
  } finally {
    if (retentionTimer) clearTimeout(retentionTimer);
    retentionTimer = setTimeout(runRetention, RETENTION_INTERVAL_MS);
    if (retentionTimer.unref) retentionTimer.unref();
  }
}

async function start() {
  try {
    const n = await CandidateRepo.resetStaleProcessing(10);
    if (n) console.log('[worker] reclaimed', n, 'stale processing candidate(s)');
  } catch (err) {
    console.error('[worker] startup recovery failed:', err.message);
  }
  console.log('[worker] résumé-analysis worker started');
  schedule();
  // Kick off the retention sweep shortly after boot, then every 6h.
  const rt = setTimeout(runRetention, 30000);
  if (rt.unref) rt.unref();
}

module.exports = { start, tick, runRetention };
