const crypto = require('crypto');

// Transparent encryption-at-rest for sensitive settings values (the AI API key).
// AES-256-GCM, keyed from SETTINGS_ENC_KEY (falls back to JWT_SECRET). Stored
// values are prefixed so we can tell encrypted from legacy plaintext and stay
// backward compatible.
//
// NOTE: the encryption key is derived from SETTINGS_ENC_KEY (or JWT_SECRET). If
// you rotate that secret, previously stored keys can't be decrypted — just
// re-enter the API key in Settings.
const PREFIX = 'enc:v1:';

// Resolve the 32-byte AES key lazily (and memoize) so it works regardless of
// whether dotenv has loaded by the time this module is first required.
let cachedKey = null;
const getKeyBuf = () => {
  if (cachedKey) return cachedKey;
  const secret = process.env.SETTINGS_ENC_KEY || process.env.JWT_SECRET || '';
  if (!secret) return null;
  cachedKey = crypto.createHash('sha256').update(String(secret)).digest();
  return cachedKey;
};

const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

function encrypt(plain) {
  if (!plain) return plain || ''; // empty stays empty
  const keyBuf = getKeyBuf();
  if (!keyBuf) return plain; // no secret configured → store as-is (shouldn't happen; JWT_SECRET is required)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(stored) {
  if (!stored || typeof stored !== 'string') return '';
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const keyBuf = getKeyBuf();
  if (!keyBuf) return '';
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('Settings secret decrypt failed:', err.message);
    return '';
  }
}

module.exports = { encrypt, decrypt, isEncrypted };
