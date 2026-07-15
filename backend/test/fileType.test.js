const { test } = require('node:test');
const assert = require('node:assert');
const { sniff, matchesExtension } = require('../utils/fileType');

const bytes = (...b) => Buffer.from(b);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj');
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0); // .docx is a zip
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1); // legacy .doc
const RTF = Buffer.from('{\\rtf1\\ansi');
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00, 0, 0); // 'MZ' Windows PE
const TXT = Buffer.from('Jane Doe\nSenior Engineer\nExperience: ...');

test('sniff: recognizes known signatures', () => {
  assert.strictEqual(sniff(PDF), 'pdf');
  assert.strictEqual(sniff(PNG), 'png');
  assert.strictEqual(sniff(JPG), 'jpg');
  assert.strictEqual(sniff(ZIP), 'zip');
  assert.strictEqual(sniff(OLE), 'ole');
  assert.strictEqual(sniff(RTF), 'rtf');
  assert.strictEqual(sniff(EXE), null); // unknown → null
});

test('matchesExtension: genuine files pass', () => {
  assert.ok(matchesExtension(PDF, '.pdf'));
  assert.ok(matchesExtension(PNG, '.png'));
  assert.ok(matchesExtension(JPG, '.jpeg'));
  assert.ok(matchesExtension(ZIP, '.docx'));
  assert.ok(matchesExtension(OLE, '.doc'));
  assert.ok(matchesExtension(RTF, '.rtf'));
});

test('matchesExtension: rejects a spoofed extension (malware renamed cv.pdf)', () => {
  assert.strictEqual(matchesExtension(EXE, '.pdf'), false);
  assert.strictEqual(matchesExtension(EXE, '.docx'), false);
  assert.strictEqual(matchesExtension(EXE, '.png'), false);
  assert.strictEqual(matchesExtension(PNG, '.jpg'), false); // png bytes, jpg ext
});

test('matchesExtension: extensions without a signature (txt) are allowed', () => {
  assert.ok(matchesExtension(TXT, '.txt'));
  assert.ok(matchesExtension(EXE, '.txt')); // .txt has no magic; content served as attachment+nosniff
});
