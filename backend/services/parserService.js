const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'gif'];

// DoS guards: a small upload can expand into a lot of work/memory (OCR renders +
// recognizes each page; a résumé's text feeds a paid AI call). Bound both.
const MAX_OCR_PAGES = 15;        // don't OCR an unbounded number of PDF pages
const MAX_TEXT_CHARS = 200000;   // truncate extracted text (~50k tokens) before use
const capText = (t) => {
  const s = String(t || '');
  return s.length > MAX_TEXT_CHARS ? s.slice(0, MAX_TEXT_CHARS) : s;
};

// --- OCR: one lazily-created Tesseract worker, reused across files ---
// The worker is heavy (hundreds of MB). It's reused across a burst of files for
// speed, then TERMINATED after a short idle so it doesn't sit resident and
// exhaust memory on small hosts (a cause of 502s on free tiers).
let ocrWorkerPromise = null;
let ocrIdleTimer = null;
const OCR_IDLE_MS = 30000;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    const { createWorker } = require('tesseract.js');
    ocrWorkerPromise = createWorker('eng');
  }
  return ocrWorkerPromise;
}

function scheduleOcrUnload() {
  if (ocrIdleTimer) clearTimeout(ocrIdleTimer);
  ocrIdleTimer = setTimeout(async () => {
    const pending = ocrWorkerPromise;
    ocrWorkerPromise = null;
    ocrIdleTimer = null;
    try {
      const worker = await pending;
      if (worker) await worker.terminate();
    } catch (_) { /* best-effort */ }
  }, OCR_IDLE_MS);
  if (ocrIdleTimer.unref) ocrIdleTimer.unref(); // don't keep the process alive
}

async function ocrBuffer(buffer) {
  const worker = await getOcrWorker();
  try {
    const { data } = await worker.recognize(buffer);
    return data && data.text ? data.text : '';
  } finally {
    scheduleOcrUnload();
  }
}

const hasMeaningfulText = (text) => (text || '').replace(/\s/g, '').length >= 20;

// --- Link harvesting -------------------------------------------------------
// Résumé URLs (GitHub, LinkedIn, portfolio, project links) usually live in the
// file's hyperlink metadata, NOT the visible text stream — so plain-text
// extraction silently drops them. We recover them from the document structure
// and append a labelled block so both the LLM and the heuristic engine see the
// real targets.

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>()"']+|mailto:[^\s<>()"']+)/gi;

const cleanUrl = (u) => {
  let s = (u || '').trim();
  s = s.replace(/[.,;:'")\]}>]+$/, ''); // strip trailing punctuation captured from prose
  if (/^www\./i.test(s)) s = 'https://' + s;
  return s;
};

const isLink = (u) => /^(https?:\/\/|mailto:)/i.test(u);

const urlsFromText = (text) => {
  const out = new Set();
  (String(text || '').match(URL_RE) || []).forEach((u) => {
    const c = cleanUrl(u);
    if (isLink(c)) out.add(c);
  });
  return out;
};

// PDF link annotations serialize as `/URI (https://...)` in the raw bytes.
const urlsFromPdfBuffer = (buffer) => {
  const out = new Set();
  try {
    const raw = buffer.toString('latin1');
    const re = /\/URI\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(raw))) {
      const u = cleanUrl(m[1].replace(/\\([()\\])/g, '$1')); // unescape PDF string escapes
      if (isLink(u)) out.add(u);
    }
  } catch (_) { /* best-effort */ }
  return out;
};

// DOCX hyperlinks survive in the HTML rendering as href attributes.
const urlsFromDocx = async (buffer) => {
  const out = new Set();
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const re = /href="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const u = cleanUrl(m[1]);
      if (isLink(u)) out.add(u);
    }
  } catch (_) { /* best-effort */ }
  return out;
};

// .doc (binary) and RTF embed links as `HYPERLINK "url"` field codes.
const urlsFromFieldCodes = (str) => {
  const out = new Set();
  try {
    const re = /HYPERLINK\s+"([^"]+)"/gi;
    let m;
    while ((m = re.exec(str))) {
      const u = cleanUrl(m[1]);
      if (isLink(u)) out.add(u);
    }
  } catch (_) { /* best-effort */ }
  return out;
};

// Merge harvested URL sets + any visible-text URLs, and append a labelled block.
const appendLinks = (text, ...urlSets) => {
  const merged = new Set();
  urlSets.forEach((set) => set && set.forEach((u) => merged.add(u)));
  urlsFromText(text).forEach((u) => merged.add(u));
  // capText bounds the extracted text (DoS/AI-cost guard) at the single point
  // every parse path funnels through.
  if (merged.size === 0) return capText(text);
  return capText(`${text}\n\n[DETECTED LINKS]\n${[...merged].join('\n')}`);
};

class ParserService {
  static async parsePDF(buffer) {
    let parser;
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      let text = (result.text || '').trim();

      // Scanned/image-only PDF has no embedded text -> render pages and OCR them.
      if (!hasMeaningfulText(text)) {
        try {
          const shot = await parser.getScreenshot({ imageBuffer: true, scale: 2 });
          const pages = (shot && shot.pages) || [];
          let ocrText = '';
          // Cap OCR'd pages — a huge scanned PDF shouldn't pin CPU/memory OCR-ing
          // hundreds of pages (a résumé's signal is in the first few anyway).
          for (const page of pages.slice(0, MAX_OCR_PAGES)) {
            if (page && page.data) {
              ocrText += (await ocrBuffer(Buffer.from(page.data))) + '\n';
            }
          }
          if (ocrText.trim().length > text.length) text = ocrText.trim();
        } catch (ocrErr) {
          console.warn('PDF OCR fallback failed:', ocrErr.message);
        }
      }
      return text;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }
  }

  static async parseDOCX(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('Error parsing DOCX:', error);
      throw new Error(`Failed to parse DOCX: ${error.message}`);
    }
  }

  static async parseDOC(buffer) {
    try {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody();
    } catch (error) {
      console.error('Error parsing DOC:', error);
      throw new Error(`Failed to parse DOC: ${error.message}`);
    }
  }

  static parseTXT(buffer) {
    return buffer.toString('utf8');
  }

  static parseRTF(buffer) {
    // Lightweight RTF -> text: drop control words, hex escapes and grouping braces.
    return buffer
      .toString('utf8')
      .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
      .replace(/\\[a-zA-Z]+-?\d* ?/g, ' ')
      .replace(/[{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static async parseImage(buffer) {
    try {
      return await ocrBuffer(buffer);
    } catch (error) {
      console.error('Error running OCR on image:', error);
      throw new Error(`Failed to OCR image: ${error.message}`);
    }
  }

  /**
   * Extract plain text from any supported resume format.
   * Supported: PDF (incl. scanned via OCR), DOC, DOCX, TXT, RTF, and images
   * (PNG/JPG/JPEG/WEBP/BMP/TIFF/GIF via OCR).
   */
  static async extractText(buffer, mimeType, originalName) {
    const ext = (originalName || '').split('.').pop().toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    if (ext === 'pdf' || mime === 'application/pdf') {
      const text = await this.parsePDF(buffer);
      return appendLinks(text, urlsFromPdfBuffer(buffer));
    }
    if (ext === 'docx' || mime.includes('officedocument.wordprocessingml')) {
      const text = await this.parseDOCX(buffer);
      return appendLinks(text, await urlsFromDocx(buffer));
    }
    if (ext === 'doc' || mime === 'application/msword') {
      const text = await this.parseDOC(buffer);
      return appendLinks(text, urlsFromFieldCodes(buffer.toString('latin1')));
    }
    if (ext === 'txt' || mime === 'text/plain') {
      // Plain text already contains any URLs verbatim; appendLinks normalizes them.
      return appendLinks(this.parseTXT(buffer));
    }
    if (ext === 'rtf' || mime === 'application/rtf' || mime === 'text/rtf') {
      const text = this.parseRTF(buffer);
      return appendLinks(text, urlsFromFieldCodes(buffer.toString('latin1')));
    }
    if (IMAGE_EXTS.includes(ext) || mime.startsWith('image/')) {
      // OCR text may contain visible URLs; there is no hyperlink layer in an image.
      return appendLinks(await this.parseImage(buffer));
    }

    throw new Error('Unsupported file format. Supported: PDF, DOC, DOCX, TXT, RTF, and images (JPG/PNG/etc.).');
  }
}

module.exports = ParserService;
