const { test } = require('node:test');
const assert = require('node:assert/strict');

// The encryption key is derived lazily from SETTINGS_ENC_KEY (or JWT_SECRET) and
// memoized on first use, so set it BEFORE requiring the module.
process.env.SETTINGS_ENC_KEY = 'unit-test-encryption-secret-key';

const { encrypt, decrypt, isEncrypted } = require('../utils/secretCrypto');

test('encrypt -> decrypt round-trips the original value', () => {
  const secret = 'nvapi-super-secret-key-1234567890';
  const enc = encrypt(secret);
  assert.notEqual(enc, secret);
  assert.equal(decrypt(enc), secret);
});

test('encrypted values are tagged and recognized by isEncrypted', () => {
  const enc = encrypt('hello');
  assert.ok(enc.startsWith('enc:v1:'));
  assert.equal(isEncrypted(enc), true);
  assert.equal(isEncrypted('plain-text'), false);
  assert.equal(isEncrypted(''), false);
});

test('empty input stays empty (nothing to encrypt)', () => {
  assert.equal(encrypt(''), '');
  assert.equal(encrypt(null), '');
  assert.equal(encrypt(undefined), '');
});

test('decrypt passes through legacy plaintext unchanged', () => {
  // Values stored before encryption-at-rest was added are not prefixed.
  assert.equal(decrypt('legacy-plain-key'), 'legacy-plain-key');
});

test('decrypt returns empty string for empty / non-string input', () => {
  assert.equal(decrypt(''), '');
  assert.equal(decrypt(null), '');
  assert.equal(decrypt(123), '');
});

test('SECURITY: tampered ciphertext fails authentication and returns empty', () => {
  const enc = encrypt('sensitive');
  // Corrupt the first payload character (part of the IV) — avoid the trailing
  // base64 padding, which doesn't map to real bytes.
  const body = enc.slice('enc:v1:'.length);
  const tamperedChar = body[0] === 'A' ? 'B' : 'A';
  const tampered = 'enc:v1:' + tamperedChar + body.slice(1);

  // decrypt logs the failure; silence it so the test output stays clean.
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(decrypt(tampered), '');
  } finally {
    console.error = origError;
  }
});

test('each encryption uses a fresh IV so ciphertexts differ', () => {
  const a = encrypt('same-value');
  const b = encrypt('same-value');
  assert.notEqual(a, b);
  assert.equal(decrypt(a), 'same-value');
  assert.equal(decrypt(b), 'same-value');
});
