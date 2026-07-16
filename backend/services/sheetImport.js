// Sheet lead import (.csv or .xlsx). Parses an uploaded leads sheet and mirrors
// the Meta-lead ingestion path: create a candidate per row (source 'Sheet', no
// résumé), then fire the same WhatsApp résumé-request. Rows that already carry a
// résumé link are stored for manual review (we can't safely fetch/parse an
// external URL — analysis only runs on résumés uploaded THROUGH the system).
//
// .xlsx is read by a small, dependency-free reader (utils/xlsxParser) rather than
// SheetJS/exceljs, which ship with known advisories that would regress the audit.

const crypto = require('crypto');
const CandidateRepo = require('../models/candidateRepo');
const AuditRepo = require('../models/auditRepo');
const WhatsApp = require('./whatsappService');
const LeadIngestion = require('./leadIngestion');
const { parseXlsx } = require('../utils/xlsxParser');

const MAX_ROWS = 20000;

// RFC-4180-ish CSV parser: handles quoted fields, embedded commas/newlines, and
// "" escapes, with CRLF or LF line endings. Returns an array of string arrays.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore; \n ends the row */ }
    else if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Header synonyms → our canonical field. Matched case/space-insensitively.
const FIELD_SYNONYMS = {
  name: ['name', 'fullname', 'candidate', 'candidatename', 'applicant', 'applicantname'],
  email: ['email', 'emailaddress', 'e-mail', 'mail'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'whatsapp', 'whatsappnumber', 'contact', 'contactnumber', 'tel', 'telephone'],
  resumeUrl: ['resume', 'resumeurl', 'cv', 'cvurl', 'resumelink', 'cvlink'],
  location: ['place', 'location', 'city', 'currentlocation', 'address', 'district'],
  salary: ['salary', 'salaryexpectation', 'expectedsalary', 'ctc', 'expectedctc'],
};

const squash = (h) => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

// Map header cells → { field: columnIndex } using the synonym table.
function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const key = squash(h);
    for (const [field, syns] of Object.entries(FIELD_SYNONYMS)) {
      if (map[field] === undefined && syns.includes(key)) map[field] = idx;
    }
  });
  return map;
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

const phoneKeyOf = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-10) : ''; // last-10-digit key, tolerant of +country code
};

/**
 * Import leads from a .csv/.xlsx buffer into the chosen `job`. Identity is email
 * OR phone — a phone-only lead sheet (the common Meta-ad case) is fine. EVERY row
 * lands in `job` (no role-based routing). Dedups in one pass and bulk-inserts, so
 * a large sheet imports fast. Never throws on a bad row — issues are
 * counted/reported. Returns a summary.
 */
async function importCsvLeads(settings, job, buffer, actor = null) {
  const summary = {
    totalRows: 0, created: 0, duplicates: 0, skippedNoContact: 0,
    withResume: 0, whatsappSent: 0, whatsappSkipped: 0, errors: [],
  };

  let table;
  try {
    // .xlsx is a ZIP archive ('PK'); anything else we treat as CSV text.
    const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    table = isZip ? parseXlsx(buffer) : parseCsv(buffer.toString('utf8'));
  } catch (e) {
    summary.errors.push(`Could not read the sheet (${e.message}). Re-save it as .xlsx or .csv and try again.`);
    return summary;
  }
  table = table.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!table.length) { summary.errors.push('The file is empty.'); return summary; }

  const cols = mapHeaders(table[0]);
  if (cols.email === undefined && cols.phone === undefined) {
    summary.errors.push('No "Email" or "Phone" column found. Include a header row with at least Name and Phone (Email is optional).');
    return summary;
  }

  const dataRows = table.slice(1);
  if (dataRows.length > MAX_ROWS) {
    summary.errors.push(`Only the first ${MAX_ROWS} rows were imported (${dataRows.length} found).`);
  }
  const cell = (row, field) => (cols[field] !== undefined ? String(row[cols[field]] || '').trim() : '');

  // Pre-load existing identities for THIS job in one paginated query so dedup is
  // a set lookup rather than a query per row.
  const seenEmails = new Set();
  const seenPhones = new Set();
  try {
    for (const e of await CandidateRepo.listIdentitiesForJobs([job._id])) {
      if (e.email) seenEmails.add(String(e.email).toLowerCase());
      const pk = phoneKeyOf(e.phone);
      if (pk) seenPhones.add(pk);
    }
  } catch (_) { /* dedup is best-effort */ }

  // Build the rows to create (dedup within the sheet + against existing).
  const toCreate = [];
  for (const row of dataRows.slice(0, MAX_ROWS)) {
    summary.totalRows += 1;
    const email = cell(row, 'email').toLowerCase();
    const emailKey = isEmail(email) ? email : '';
    const phoneKey = phoneKeyOf(cell(row, 'phone'));
    if (!emailKey && !phoneKey) { summary.skippedNoContact += 1; continue; }

    const dup = (emailKey && seenEmails.has(emailKey)) || (!emailKey && phoneKey && seenPhones.has(phoneKey));
    if (dup) { summary.duplicates += 1; continue; }
    if (emailKey) seenEmails.add(emailKey);
    if (phoneKey) seenPhones.add(phoneKey);

    const resumeUrl = cell(row, 'resumeUrl');
    const hasResume = isHttpUrl(resumeUrl);
    if (hasResume) summary.withResume += 1;
    toCreate.push({
      name: cell(row, 'name') || 'Lead (name pending)',
      email: emailKey, // '' when phone-only (column is not-null but allows empty)
      phone: cell(row, 'phone'),
      currentLocation: cell(row, 'location') || undefined,
      salaryExpectation: cell(row, 'salary') || undefined,
      resumeUrl: hasResume ? resumeUrl : null,
      jobId: job._id,
      status: 'Applied',
      source: 'Sheet',
      analysisStatus: 'completed', // a résumé must arrive via WhatsApp/upload to be scored
      consentAt: new Date().toISOString(),
      resumeUploadToken: crypto.randomBytes(24).toString('hex'),
      aiAnalysis: {},
    });
  }

  // Bulk-insert in chunks (fast even for thousands of rows).
  const created = [];
  for (let i = 0; i < toCreate.length; i += 500) {
    try {
      const rows = await CandidateRepo.createMany(toCreate.slice(i, i + 500));
      created.push(...rows);
      summary.created += rows.length;
    } catch (e) {
      summary.errors.push(`A batch of rows failed to import: ${e.message}`);
    }
  }

  // Ask each new lead (without a résumé) for one over WhatsApp — self-disables
  // when WhatsApp isn't configured, so this is a fast no-op until it's set up.
  const appBaseUrl = LeadIngestion._appBaseUrl();
  const canSend = WhatsApp.isConfigured(settings);
  for (const c of created) {
    if (c.resumeUrl || !c.phone || !canSend) { summary.whatsappSkipped += 1; continue; }
    const wa = await WhatsApp.sendResumeRequest(settings, {
      toPhone: c.phone, name: c.name, jobTitle: job.title,
      uploadUrl: `${appBaseUrl}/u/${c.resumeUploadToken}`,
    });
    if (wa.sent) { summary.whatsappSent += 1; await CandidateRepo.markResumeRequested(c._id).catch(() => {}); }
    else summary.whatsappSkipped += 1;
  }

  AuditRepo.log(actor, 'lead.import_sheet', {
    entityType: 'job', entityId: job._id,
    summary: `Sheet import → "${job.title}": ${summary.created} new, ${summary.duplicates} dup, ${summary.whatsappSent} WhatsApp`,
    meta: summary,
  });

  return summary;
}

module.exports = { importCsvLeads, parseCsv, mapHeaders, _squash: squash };
