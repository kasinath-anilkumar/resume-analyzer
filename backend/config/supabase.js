const { createClient } = require('@supabase/supabase-js');

// Single Supabase client shared across the backend. It uses the SERVICE ROLE
// key, so it bypasses Row Level Security — every request is already
// authenticated and authorized server-side (JWT + role middleware). This key
// must never be exposed to the browser.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else {
  console.error(
    '\n[FATAL] Supabase is not configured. Set SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY in backend/.env before starting the server.\n'
  );
}

const isConfigured = () => Boolean(supabase);

// Throwing accessor so a missing config fails loudly at the first query rather
// than with a confusing "cannot read property from null".
const getClient = () => {
  if (!supabase) {
    throw new Error(
      'Database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.'
    );
  }
  return supabase;
};

module.exports = { supabase, getClient, isConfigured };
