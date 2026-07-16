const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Fail fast on a missing/weak JWT secret. Tokens are the whole authentication
// story (and SETTINGS_ENC_KEY falls back to this same value to encrypt provider
// credentials), so a blank/default/short secret is a critical misconfiguration —
// refuse to boot rather than run forgeable sessions. Skipped under NODE_ENV=test.
const PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-long-random-string',
  'your-secret-key',
  'secret',
  'changeme',
]);
if (process.env.NODE_ENV !== 'test') {
  const s = process.env.JWT_SECRET || '';
  if (!s || s.length < 32 || PLACEHOLDER_SECRETS.has(s)) {
    console.error(
      'FATAL: JWT_SECRET is missing, too short (<32 chars), or a known placeholder. ' +
      'Set a long random value (e.g. `openssl rand -base64 48`) before starting.'
    );
    process.exit(1);
  }
  if (!process.env.SETTINGS_ENC_KEY) {
    console.warn(
      'WARNING: SETTINGS_ENC_KEY is not set — provider credentials are encrypted with ' +
      'JWT_SECRET as a fallback. Set a distinct SETTINGS_ENC_KEY so one leak does not ' +
      'compromise both auth and stored secrets.'
    );
  }
}

// Resilience: a stray unhandled promise rejection would otherwise crash the
// Node process (Node 15+), which surfaces to clients as a 502 from Render and
// restarts the server. Log it instead and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (kept alive):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (kept alive):', err);
});

// Verify the Supabase (Postgres) data layer is configured. Loading the client
// module logs a fatal error if the env vars are missing; queries then throw a
// clear message rather than failing silently.
const { isConfigured } = require('./config/supabase');
if (isConfigured()) {
  console.log('Supabase data layer configured.');
  // Start the background résumé-analysis worker IN-PROCESS unless RUN_WORKER=false.
  // At scale, run the worker as a SEPARATE service (`npm run worker`) and set
  // RUN_WORKER=false here so OCR/AI spikes don't compete with web requests — and
  // so the queue isn't drained by two places at once.
  if (String(process.env.RUN_WORKER).toLowerCase() !== 'false') {
    require('./services/analysisWorker').start().catch((e) => console.error('Worker start failed:', e.message));
  } else {
    console.log('[worker] in-process worker disabled (RUN_WORKER=false) — expecting a separate worker service.');
  }
} else {
  console.warn('WARNING: Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.');
}

const app = express();

// Behind Render/Vercel/other proxies, trust the first proxy hop so the client's
// real IP (X-Forwarded-For) is used for rate limiting and logging.
app.set('trust proxy', 1);

// Middlewares
// Restrict CORS to known frontend origins. Extra origins can be supplied via
// CLIENT_URL in .env as a comma-separated list.
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
];
const allowedOrigins = [
  ...defaultOrigins,
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((o) => o.trim()) : []),
];

// Allow the exact configured origins, plus (unless disabled) any Vercel
// deployment, since production + preview URLs are all *.vercel.app. Set
// ALLOW_VERCEL_PREVIEWS=false and pin CLIENT_URL to lock this down to your exact
// production domain(s) once previews aren't needed.
const allowVercel = String(process.env.ALLOW_VERCEL_PREVIEWS ?? 'true').toLowerCase() !== 'false';
const isAllowedOrigin = (origin) => {
  if (allowedOrigins.includes(origin)) return true;
  if (!allowVercel) return false;
  try {
    return /\.vercel\.app$/i.test(new URL(origin).hostname);
  } catch (_) {
    return false;
  }
};

// Security headers. This is a cross-origin JSON API (consumed by the Vercel
// frontend), so relax CORP to cross-origin; the rest (nosniff, frameguard, HSTS,
// referrer-policy) apply as defense-in-depth. CSP is left off here because this
// service serves JSON/files, not the HTML app (the SPA is served by Vercel).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser tools (curl/Postman) that send no Origin header.
      if (!origin || isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
// Cap request bodies — no legitimate JSON payload here is large, and an
// unbounded body is a cheap memory-pressure vector.
app.use(express.json({ limit: '1mb' }));

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Serve uploads statically (LOCAL DEV FALLBACK only — in production résumés live
// in Supabase Storage and are reached through the authenticated /resume-url
// endpoints, never this path). Force download + nosniff so a stored file can't
// be rendered as active content in the browser.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    next();
  },
  express.static(path.join(__dirname, 'uploads'))
);

// Routes
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/portal', require('./routes/portalRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/candidates', require('./routes/candidateRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/applicants', require('./routes/applicantsRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/integrations', require('./routes/integrationsRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

// API status check
app.get('/', (req, res) => {
  res.json({ message: 'Enterprise ATS API is running...' });
});

// Liveness + real database status. Public (no auth) so uptime monitors and the
// Settings "system status" cards can read it. Reports whether Supabase is
// configured AND actually reachable via a cheap head-count probe on the
// single-row settings table. Always responds 200 so the client can read the
// body on one success path; `ok` reflects real DB reachability.
app.get('/api/health', async (req, res) => {
  const { isConfigured, getClient } = require('./config/supabase');
  const database = { type: 'Supabase (Postgres)', configured: isConfigured(), connected: false };

  if (database.configured) {
    try {
      const probe = getClient().from('settings').select('id', { count: 'exact', head: true });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db probe timeout')), 3000)
      );
      const { error } = await Promise.race([probe, timeout]);
      if (error) throw error;
      database.connected = true;
    } catch (_) {
      database.connected = false;
    }
  }

  res.json({ ok: database.connected, uptime: Math.round(process.uptime()), database });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  // Check for Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File is too large. Maximum size allowed is 10MB.' });
  }

  if (err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  const status = err.status || 500;
  // Never echo raw error text for 5xx — an uncaught Postgres/validation error
  // reaching here could leak column names, SQL, or internal paths. 4xx messages
  // are ones we set deliberately, so they're safe to return.
  const message = status < 500 ? (err.message || 'Request error') : 'Internal Server Error';
  return res.status(status).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
