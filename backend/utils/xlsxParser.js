// Minimal, dependency-free .xlsx reader → rows as string[][] (same shape the CSV
// parser returns). Reads the ZIP via its central directory, inflates entries with
// the built-in zlib, and pulls text/number cells from the first worksheet
// (shared strings + inline strings; formulas resolve to their cached value).
//
// Why hand-rolled: the maintained XLSX libraries (SheetJS `xlsx`, `exceljs`) ship
// with known advisories that would regress this repo's clean `npm audit`. This
// covers what Excel / Google Sheets produce for a simple leads sheet; anything it
// can't read throws and the importer reports it cleanly.

const zlib = require('zlib');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function findEOCD(buf) {
  const min = Math.max(0, buf.length - 65557); // max comment (64KB) + 22-byte record
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readCentralDirectory(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('not a valid .xlsx (no ZIP end record)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count && off + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(off) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntry(buf, entry) {
  const lo = entry.localOff;
  if (buf.readUInt32LE(lo) !== SIG_LOCAL) throw new Error('corrupt ZIP entry');
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return data;                 // stored
  if (entry.method === 8) return zlib.inflateRawSync(data); // deflate
  throw new Error('unsupported compression in .xlsx');
}

function readZip(buf) {
  const entries = readCentralDirectory(buf);
  const byName = {};
  for (const e of entries) byName[e.name] = e;
  return {
    names: entries.map((e) => e.name),
    read: (name) => (byName[name] ? extractEntry(buf, byName[name]).toString('utf8') : null),
  };
}

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s) => String(s == null ? '' : s)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => XML_ENT[n]);

// sharedStrings.xml → indexed array (concatenate <t> across any <r> runs).
function parseSharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(m[1]))) text += unescapeXml(t[1]);
    out.push(text);
  }
  return out;
}

const colToIndex = (ref) => {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

function parseSheet(xml, shared) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = [];
    let seq = 0;
    const cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cm;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1] || cm[3] || '';
      const body = cm[2] || '';
      const type = (/t="([^"]+)"/.exec(attrs) || [])[1] || '';
      const ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1];
      let val = '';
      if (type === 'inlineStr') {
        const is = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
        val = is ? unescapeXml(is[1]) : '';
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        const raw = v ? v[1] : '';
        val = type === 's' ? (shared[parseInt(raw, 10)] || '') : unescapeXml(raw);
      }
      const idx = ref ? colToIndex(ref) : seq;
      if (idx >= 0) { cells[idx] = val; seq = idx + 1; }
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}

// Parse an .xlsx buffer → string[][]. Throws on anything it can't read.
function parseXlsx(buffer) {
  const zip = readZip(buffer);
  let sheetXml = zip.read('xl/worksheets/sheet1.xml');
  if (!sheetXml) {
    const first = zip.names.find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    sheetXml = first ? zip.read(first) : null;
  }
  if (!sheetXml) throw new Error('no worksheet found in the .xlsx');
  const shared = parseSharedStrings(zip.read('xl/sharedStrings.xml'));
  return parseSheet(sheetXml, shared);
}

module.exports = { parseXlsx };
