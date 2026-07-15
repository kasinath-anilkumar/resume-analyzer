/**
 * Standalone résumé-analysis worker process.
 *
 * Run this as a SEPARATE service (e.g. a Render Background Worker) so the
 * memory/CPU-heavy work (OCR, AI analysis, embeddings, Meta lead polling) can't
 * starve the web server's request handling. It shares the same database + env as
 * the web service.
 *
 *   npm run worker
 *
 * IMPORTANT: when you run this, set RUN_WORKER=false on the WEB service so the
 * queue isn't drained in two places at once.
 */
require('dotenv').config();
const { isConfigured } = require('./config/supabase');

// Global crash guards — a background loop should log and keep running, not die.
process.on('unhandledRejection', (err) => console.error('[worker] unhandledRejection:', err?.message || err));
process.on('uncaughtException', (err) => console.error('[worker] uncaughtException:', err?.message || err));

if (!isConfigured()) {
  console.error('[worker] Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

require('./services/analysisWorker')
  .start()
  .then(() => console.log('[worker] standalone analysis worker running'))
  .catch((e) => { console.error('[worker] failed to start:', e.message); process.exit(1); });

// The worker's own timers are unref'd, so hold the process open explicitly.
const keepAlive = setInterval(() => {}, 1 << 30);
const shutdown = () => { clearInterval(keepAlive); console.log('[worker] shutting down'); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
