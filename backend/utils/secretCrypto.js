const crypto = require('crypto');

// Transparent encryption-at-rest for sensitive settings values (AI / Meta /
// WhatsApp tokens). AES-256-GCM. Stored values are prefixed so we can tell
// encrypted from legacy plaintext and stay backward compatible.
//
// KEY ROTATION (safe): the ACTIVE key is SETTINGS_ENC_KEY (falls back to
// JWT_SECRET only when SETTINGS_ENC_KEY is unset). encrypt() always uses the
// active key. decrypt() tries the active key first, then any LEGACY keys
// (JWT_SECRET, and SETTINGS_ENC_KEY_OLD if set) — so introducing a dedicated
// SETTINGS_ENC_KEY does NOT break values previously encrypted under JWT_SECRET.
// Re-saving a secret (or running scripts/reencryptSecrets.js) upgrades it to the
// active key. Best practice: set a SETTINGS_ENC_KEY distinct from JWT_SECRET so a
// leaked auth secret can't also decrypt stored provider tokens.
const PREFIX = 'enc:v1:';

// Resolve the ordered list of 32-byte candidate keys lazily (and memoize) so it
// works regardless of dotenv load order. Index 0 is the active key.
let cachedKeys = null;
const getKeys = () => {
  if (cachedKeys) return cachedKeys;
  const secrets = [];
  const push = (s) => { if (s && !secrets.includes(s)) secrets.push(s); };
  push(process.env.SETTINGS_ENC_KEY || process.env.JWT_SECRET || ''); // active
  push(process.env.JWT_SECRET || '');            // legacy (pre-SETTINGS_ENC_KEY)
  push(process.env.SETTINGS_ENC_KEY_OLD || '');  // previous key during a rotation
  cachedKeys = secrets.map((s) => crypto.createHash('sha256').update(String(s)).digest());
  return cachedKeys;
};

// Test hook — reset the memoized keys after mutating env in a test.
const _resetKeyCache = () => { cachedKeys = null; };

const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

function encrypt(plain) {
  if (!plain) return plain || ''; // empty stays empty
  const keys = getKeys();
  if (!keys.length) return plain; // no secret configured (shouldn't happen; JWT_SECRET is required)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys[0], iv); // active key
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

// Decrypt, trying each candidate key until the GCM auth tag verifies.
function decrypt(stored) {
  if (!stored || typeof stored !== 'string') return '';
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const keys = getKeys();
  if (!keys.length) return '';
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  for (const keyBuf of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (_) { /* wrong key — try the next candidate */ }
  }
  console.error('Settings secret decrypt failed: no candidate key matched (tampered, or key rotated away).');
  return '';
}

// True if a stored value decrypts ONLY under a legacy key (i.e. it should be
// re-encrypted under the active key). Used by the re-encrypt migration.
function needsReencrypt(stored) {
  if (!isEncrypted(stored)) return false;
  const keys = getKeys();
  if (keys.length < 2) return false;
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12); const tag = raw.subarray(12, 28); const data = raw.subarray(28);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keys[0], iv);
    d.setAuthTag(tag); d.update(data); d.final();
    return false; // active key already works
  } catch (_) { return decrypt(stored) !== ''; } // active failed but a legacy key works
}

module.exports = { encrypt, decrypt, isEncrypted, needsReencrypt, _resetKeyCache };
