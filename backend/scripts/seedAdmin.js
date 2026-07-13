/**
 * Create (or report) the first Admin account.
 *
 * Public self-registration is disabled, so the very first Admin must be seeded
 * here. After that, this Admin creates everyone else via User Management.
 *
 * Usage (from backend/):
 *   node scripts/seedAdmin.js "Full Name" admin@company.com "StrongPassword"
 * or via env vars:
 *   ADMIN_NAME="Full Name" ADMIN_EMAIL=admin@company.com ADMIN_PASSWORD=Secret node scripts/seedAdmin.js
 * or:
 *   npm run seed:admin -- "Full Name" admin@company.com "StrongPassword"
 */
require('dotenv').config();
const UserRepo = require('../models/userRepo');
const { isConfigured } = require('../config/supabase');

async function main() {
  if (!isConfigured()) {
    console.error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env first.');
    process.exit(1);
  }

  const [, , argName, argEmail, argPassword] = process.argv;
  const name = argName || process.env.ADMIN_NAME;
  const email = argEmail || process.env.ADMIN_EMAIL;
  const password = argPassword || process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error('Usage: node scripts/seedAdmin.js "Full Name" admin@company.com "StrongPassword"');
    console.error('   (or set ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in the environment)');
    process.exit(1);
  }
  if (String(password).length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  try {
    if (await UserRepo.existsByEmail(email)) {
      console.log(`A user with email "${email}" already exists — nothing to do.`);
      process.exit(0);
    }
    const user = await UserRepo.create({ name, email, password, role: 'Admin' });
    console.log('✅ Admin account created:');
    console.log(`   name:  ${user.name}`);
    console.log(`   email: ${user.email}`);
    console.log(`   role:  ${user.role}`);
    console.log('You can now log in with these credentials.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err.message || err);
    process.exit(1);
  }
}

main();
