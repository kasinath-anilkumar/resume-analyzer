// Inbound WhatsApp → résumé attachment. When a lead replies to the résumé
// request with a document/image, match the sender phone to their candidate,
// store the file, queue analysis, and acknowledge. Never throws (a webhook must
// always be able to ack); each message is processed best-effort.

const CandidateRepo = require('../models/candidateRepo');
const AuditRepo = require('../models/auditRepo');
const StorageService = require('./storageService');
const WhatsApp = require('./whatsappService');
const { sniff } = require('../utils/fileType');

// Derive a SAFE stored extension + content-type from the sniffed magic bytes —
// never trust the sender-declared mime (avoids a text/html "résumé" being stored
// with an executable content-type).
const EXT_BY_SNIFF = { pdf: '.pdf', ole: '.doc', zip: '.docx', rtf: '.rtf', png: '.png', jpg: '.jpg', gif: '.gif', bmp: '.bmp', tiff: '.tiff', webp: '.webp' };
const MIME_BY_SNIFF = {
  pdf: 'application/pdf', ole: 'application/msword',
  zip: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', tiff: 'image/tiff', webp: 'image/webp',
};

async function processMessage(settings, msg) {
  // Only act on senders who are actually a lead awaiting a résumé — never
  // message or store data for unknown numbers.
  let lead;
  try {
    lead = await CandidateRepo.findPendingLeadByPhone(msg.from);
  } catch (e) {
    console.error('[whatsapp inbound] lookup failed:', e.message);
    return { status: 'lookup_error' };
  }
  if (!lead) return { status: 'no_match', from: msg.from };

  const isMedia = msg.mediaId && (msg.type === 'document' || msg.type === 'image');
  if (!isMedia) {
    await WhatsApp.sendText(settings, msg.from, 'Please attach your résumé as a PDF or Word document to complete your application.');
    return { status: 'nudged', candidate: lead._id };
  }

  let media;
  try {
    media = await WhatsApp.downloadMedia(settings, msg.mediaId);
  } catch (e) {
    console.error('[whatsapp inbound] media download failed:', e.message);
    return { status: 'download_failed', candidate: lead._id };
  }

  const kind = sniff(media.buffer);
  if (!kind || !EXT_BY_SNIFF[kind]) {
    await WhatsApp.sendText(settings, msg.from, 'That file type isn’t supported. Please send your résumé as a PDF or Word document.');
    return { status: 'bad_type', candidate: lead._id };
  }

  const filename = /\.[a-z0-9]{2,5}$/i.test(msg.filename || '') ? msg.filename : `resume${EXT_BY_SNIFF[kind]}`;

  let stored;
  try {
    stored = await StorageService.uploadResume(media.buffer, filename, MIME_BY_SNIFF[kind]);
  } catch (e) {
    console.error('[whatsapp inbound] storage failed:', e.message);
    return { status: 'storage_failed', candidate: lead._id };
  }

  const updated = await CandidateRepo.attachResumeById(lead._id, stored.url);
  if (!updated) return { status: 'already_had_resume', candidate: lead._id }; // idempotent

  AuditRepo.log(null, 'candidate.resume_inbound', {
    entityType: 'candidate', entityId: lead._id,
    summary: `Résumé received via WhatsApp for ${lead.name || 'lead'} → queued for analysis`,
  });
  await WhatsApp.sendText(settings, msg.from, `Got it${lead.name ? ', ' + lead.name : ''}! Your résumé was received and is under review. Thank you.`);
  return { status: 'attached', candidate: lead._id };
}

// Process a full webhook payload. Returns a summary; never throws.
async function handleWebhook(settings, body) {
  if (!WhatsApp.isInboundConfigured(settings)) return { skipped: 'not_configured' };
  const messages = WhatsApp.parseInboundMessages(body);
  const results = [];
  for (const msg of messages) {
    if (!msg.from) continue;
    try {
      results.push(await processMessage(settings, msg));
    } catch (e) {
      console.error('[whatsapp inbound] process error:', e.message);
      results.push({ status: 'error' });
    }
  }
  return { processed: results.length, results };
}

module.exports = { handleWebhook, processMessage };
