/**
 * DESTRUCTIVE — flush the database for a fresh start, keeping ONLY Admin logins.
 *
 * Deletes: candidates, jobs, applicants (portal accounts), notifications, the
 * audit log, and all non-Admin (Recruiter / Hiring Manager) users. Deletes the
 * referenced résumé files from storage. Resets Settings to defaults (erasing the
 * saved AI / Meta / WhatsApp keys — the row re-seeds on next read).
 *
 * Keeps: every user whose role = 'Admin'.
 *
 * Safety: refuses to run without `--yes`, and aborts if there is no Admin to
 * keep (so you can't lock yourself out). THIS CANNOT BE UNDONE — take a Supabase
 * backup first.
 *
 *   node scripts/flushDb.js --yes
 */
require('dotenv').config();
const { getClient } = require('../config/supabase');
const StorageService = require('../services/storageService');

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function deleteAll(db, table) {
  const { error, count } = await db.from(table).delete({ count: 'exact' }).neq('id', ZERO_UUID);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`   • ${table}: deleted ${count}`);
  return count;
}

async function main() {
  if (process.argv[2] !== '--yes') {
    console.error('Refusing to run without explicit confirmation. Re-run with:  node scripts/flushDb.js --yes');
    process.exit(1);
  }
  const db = getClient();
  console.log(`Target: ${process.env.SUPABASE_URL || '(local/unknown)'}`);

  // Guard: never leave the system with no Admin login.
  const { data: admins, error: aErr } = await db.from('users').select('id, email').eq('role', 'Admin');
  if (aErr) throw new Error(`admin check: ${aErr.message}`);
  if (!admins || admins.length === 0) {
    console.error('ABORT: no Admin user exists — flushing would lock you out. Seed an admin first (npm run seed:admin).');
    process.exit(1);
  }
  console.log(`Keeping ${admins.length} Admin(s): ${admins.map((a) => a.email).join(', ')}\n`);

  // 1) Storage: remove the résumé files referenced by candidates + applicants.
  console.log('Deleting résumé files from storage…');
  const [{ data: cands }, { data: apps }] = await Promise.all([
    db.from('candidates').select('resume_url'),
    db.from('applicants').select('resume_url'),
  ]);
  const urls = [...(cands || []), ...(apps || [])].map((r) => r.resume_url).filter(Boolean);
  let filesRemoved = 0;
  for (let i = 0; i < urls.length; i += 20) {
    const results = await Promise.all(urls.slice(i, i + 20).map((u) => StorageService.deleteResume(u).catch(() => false)));
    filesRemoved += results.filter(Boolean).length;
  }
  console.log(`   • removed ${filesRemoved} of ${urls.length} referenced files\n`);

  // 2) Rows (order respects FKs: candidates before jobs/applicants).
  console.log('Deleting rows…');
  await deleteAll(db, 'candidates');
  await deleteAll(db, 'jobs');
  await deleteAll(db, 'applicants');
  await deleteAll(db, 'notifications');
  await deleteAll(db, 'audit_log');

  // 3) Non-admin staff accounts.
  const { error: uErr, count: uCount } = await db.from('users').delete({ count: 'exact' }).neq('role', 'Admin');
  if (uErr) throw new Error(`users: ${uErr.message}`);
  console.log(`   • users (non-admin): deleted ${uCount}`);

  // 4) Settings → defaults (row re-seeds on next read, erasing stored keys).
  const { error: sErr, count: sCount } = await db.from('settings').delete({ count: 'exact' }).eq('id', 1);
  if (sErr) throw new Error(`settings: ${sErr.message}`);
  console.log(`   • settings: reset (${sCount} row cleared; defaults re-seed on next app read)\n`);

  const { data: remaining } = await db.from('users').select('email, role').order('email');
  console.log('Remaining users:', (remaining || []).map((u) => `${u.email} (${u.role})`).join(', ') || '(none!)');
  console.log('\n✅ Flush complete.');
}

main().catch((err) => {
  console.error('\n❌ Flush failed:', err.message);
  process.exit(1);
});
