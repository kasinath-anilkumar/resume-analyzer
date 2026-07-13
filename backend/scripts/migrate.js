/**
 * One-time (idempotent) schema migration runner.
 *
 * Runs backend/db/schema.sql against your Supabase Postgres over a direct
 * connection. This is needed because the app's supabase-js client can only
 * read/write rows, not run DDL (CREATE TABLE). Everything in schema.sql uses
 * "create table if not exists", so re-running is safe.
 *
 * Provide the connection string one of two ways (Supabase dashboard →
 * Project Settings → Database → Connection string → URI):
 *   DATABASE_URL="postgresql://postgres:PWD@db.xxx.supabase.co:5432/postgres" node scripts/migrate.js
 *   node scripts/migrate.js "postgresql://postgres:PWD@db.xxx.supabase.co:5432/postgres"
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.argv[2] || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing connection string.');
    console.error('Usage: node scripts/migrate.js "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"');
    console.error('   or set DATABASE_URL in the environment.');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  });

  try {
    await client.connect();
    console.log('Connected. Applying db/schema.sql …');
    await client.query(sql);
    console.log('✅ Schema applied successfully.');

    const { rows } = await client.query(
      "select table_name from information_schema.tables where table_schema='public' order by table_name"
    );
    console.log('Public tables:', rows.map((r) => r.table_name).join(', '));
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
