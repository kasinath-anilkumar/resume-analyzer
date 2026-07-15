/**
 * Re-encrypt stored provider secrets under the ACTIVE encryption key.
 *
 * Run this once after introducing (or rotating) SETTINGS_ENC_KEY. Decryption
 * already falls back to the legacy key (JWT_SECRET, or SETTINGS_ENC_KEY_OLD), so
 * the app keeps working before you run this — this just upgrades the ciphertext
 * so the legacy key is no longer needed and can be removed.
 *
 *   npm run reencrypt-secrets
 *
 * Secret VALUES are never printed.
 */
require('dotenv').config();
const SettingsRepo = require('../models/settingsRepo');

async function main() {
  const s = await SettingsRepo.get(); // returns decrypted values (any candidate key)

  // Only re-save non-empty secrets; SettingsRepo.update re-encrypts with the active key.
  const patch = {};
  if (s.aiApiKey) patch.aiApiKey = s.aiApiKey;
  if (s.metaAccessToken) patch.metaAccessToken = s.metaAccessToken;
  if (s.whatsappAccessToken) patch.whatsappAccessToken = s.whatsappAccessToken;

  const names = Object.keys(patch);
  if (!names.length) {
    console.log('No stored secrets to re-encrypt.');
    return;
  }
  await SettingsRepo.update(patch);
  console.log(`Re-encrypted ${names.length} secret(s) under the active key:`, names.join(', '));
  console.log('You can now remove SETTINGS_ENC_KEY_OLD (and stop relying on JWT_SECRET as the fallback).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Re-encrypt failed:', err.message); process.exit(1); });
