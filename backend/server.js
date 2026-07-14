const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

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
  // Start the background résumé-analysis worker (drains the pending queue).
  require('./services/analysisWorker').start().catch((e) => console.error('Worker start failed:', e.message));
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

// Allow the exact configured origins, plus any Vercel deployment (production +
// preview URLs are all *.vercel.app). Set CLIENT_URL to your production domain.
const isAllowedOrigin = (origin) => {
  if (allowedOrigins.includes(origin)) return true;
  try {
    return /\.vercel\.app$/i.test(new URL(origin).hostname);
  } catch (_) {
    return false;
  }
};

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
app.use(express.json());

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/candidates', require('./routes/candidateRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

// API status check
app.get('/', (req, res) => {
  res.json({ message: 'Enterprise ATS API is running...' });
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

  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
