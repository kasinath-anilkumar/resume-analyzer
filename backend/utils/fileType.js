// Magic-byte file sniffing. The upload filter (middleware/upload.js) can only
// see the client-declared extension + MIME — both spoofable — so an attacker can
// rename malware.exe to cv.pdf and it passes. This validates the ACTUAL bytes
// against the declared extension, closing that bypass. Used by a post-multer
// middleware (req.file.buffer is only populated after multer runs).

// Return a coarse content type by inspecting leading bytes, or null if unknown.
function sniff(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  const b = buffer;
  const hex = (n) => b.slice(0, n).toString('hex').toUpperCase();
  const ascii = (n) => b.slice(0, n).toString('latin1');

  if (ascii(4) === '%PDF') return 'pdf';
  if (ascii(5) === '{\\rtf') return 'rtf';
  // ZIP container — covers .docx/.xlsx/.pptx (OOXML) and plain zips.
  if (hex(4) === '504B0304' || hex(4) === '504B0506' || hex(4) === '504B0708') return 'zip';
  // OLE2 compound file — legacy .doc/.xls/.ppt.
  if (hex(8) === 'D0CF11E0A1B11AE1') return 'ole';
  if (hex(8) === '89504E470D0A1A0A') return 'png';
  if (hex(3) === 'FFD8FF') return 'jpg';
  if (ascii(4) === 'GIF8') return 'gif';
  if (ascii(2) === 'BM') return 'bmp';
  if (hex(4) === '49492A00' || hex(4) === '4D4D002A') return 'tiff';
  if (ascii(4) === 'RIFF' && b.length >= 12 && b.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Which sniffed type(s) are acceptable for a given file extension. TXT has no
// signature (any bytes are "text"), so it's allowed through with no byte check.
const EXT_EXPECT = {
  '.pdf': ['pdf'],
  '.docx': ['zip'],
  '.doc': ['ole'],
  '.rtf': ['rtf'],
  '.png': ['png'],
  '.jpg': ['jpg'],
  '.jpeg': ['jpg'],
  '.gif': ['gif'],
  '.bmp': ['bmp'],
  '.tif': ['tiff'],
  '.tiff': ['tiff'],
  '.webp': ['webp'],
};

// True when the buffer's real content is consistent with the declared extension.
// Unknown/txt extensions are allowed (no signature to check).
function matchesExtension(buffer, ext) {
  const e = String(ext || '').toLowerCase();
  const expected = EXT_EXPECT[e];
  if (!expected) return true; // .txt and anything without a signature
  const detected = sniff(buffer);
  if (!detected) return false; // has a signature requirement but bytes are unrecognized
  return expected.includes(detected);
}

module.exports = { sniff, matchesExtension };
