// WhatsApp Business Cloud API client — sends the "please share your résumé"
// message to a new Meta lead. Modeled on emailService: env/config-guarded,
// NEVER throws (a failed send must not break lead ingestion), returns a status.
//
// REQUIRED template shape (the admin creates + gets this approved by Meta, then
// puts its name in Settings). It must have exactly THREE body variables, in order:
//   {{1}} = candidate name   {{2}} = job title   {{3}} = résumé upload link
// e.g. body: "Hi {{1}}! Thanks for your interest in {{2}} at Parakkat Jewels.
//             Please share your résumé here to complete your application: {{3}}"
// We initiate outside WhatsApp's 24h window, so a pre-approved template is
// mandatory (free-form text is rejected by Meta until the user replies).

const axios = require('axios');
const crypto = require('crypto');

const TEMPLATE_LANG = 'en_US'; // change if the approved template is another locale
const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB — same cap as résumé uploads

const isConfigured = (settings) =>
  Boolean(settings && settings.whatsappAccessToken && settings.whatsappPhoneNumberId && settings.whatsappTemplateName);

// WhatsApp `to` wants the full international number as digits only (no +, spaces).
const normalizePhone = (phone) => String(phone || '').replace(/[^\d]/g, '');

// PURE — build the Cloud API template message body (unit-tested).
const buildTemplateBody = ({ templateName, to, name, jobTitle, uploadUrl }) => ({
  messaging_product: 'whatsapp',
  to,
  type: 'template',
  template: {
    name: templateName,
    language: { code: TEMPLATE_LANG },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(name || 'there') },
          { type: 'text', text: String(jobTitle || 'the role') },
          { type: 'text', text: String(uploadUrl || '') },
        ],
      },
    ],
  },
});

/**
 * Send the résumé-request template message. Never throws.
 * @returns {{ sent: boolean, skipped?: string, error?: string }}
 */
async function sendResumeRequest(settings, { toPhone, name, jobTitle, uploadUrl }) {
  if (!isConfigured(settings)) return { sent: false, skipped: 'not_configured' };
  const to = normalizePhone(toPhone);
  if (!to) return { sent: false, skipped: 'no_phone' };

  const version = settings.metaGraphVersion || 'v21.0';
  const body = buildTemplateBody({ templateName: settings.whatsappTemplateName, to, name, jobTitle, uploadUrl });

  try {
    const res = await axios.post(
      `https://graph.facebook.com/${version}/${settings.whatsappPhoneNumberId}/messages`,
      body,
      { headers: { Authorization: `Bearer ${settings.whatsappAccessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const messageId = res.data?.messages?.[0]?.id || null;
    return { sent: true, messageId };
  } catch (err) {
    const apiMsg = err.response?.data?.error?.message || err.message;
    console.error('[whatsapp] send failed:', apiMsg);
    return { sent: false, error: apiMsg };
  }
}

// ---------------------------------------------------------------------------
//  Inbound webhook (candidate replies with their résumé in the WhatsApp chat)
// ---------------------------------------------------------------------------

// True inbound is possible once the app secret + verify token are set.
const isInboundConfigured = (settings) =>
  Boolean(settings && settings.whatsappAppSecret && settings.whatsappVerifyToken && settings.whatsappAccessToken);

// Verify Meta's X-Hub-Signature-256 HMAC over the RAW request body. Constant-time.
function verifyWebhookSignature(appSecret, rawBody, signatureHeader) {
  if (!appSecret || !signatureHeader || !rawBody || !rawBody.length) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Flatten a Cloud API webhook payload into simple message records.
function parseInboundMessages(body) {
  const out = [];
  for (const entry of (body && body.entry) || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contactName = value.contacts?.[0]?.profile?.name || '';
      for (const m of value.messages || []) {
        const media = m.document || m.image || null;
        out.push({
          from: m.from,
          type: m.type,
          mediaId: media ? media.id : null,
          mime: media ? media.mime_type || '' : '',
          filename: (m.document && m.document.filename) || '',
          text: (m.text && m.text.body) || '',
          contactName,
        });
      }
    }
  }
  return out;
}

// Download a media object by id: resolve its short-lived URL, then fetch the
// bytes (both calls need the bearer token). Caps at MAX_MEDIA_BYTES.
async function downloadMedia(settings, mediaId) {
  const version = settings.metaGraphVersion || 'v21.0';
  const token = settings.whatsappAccessToken;
  const meta = await axios.get(`https://graph.facebook.com/${version}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
  });
  const url = meta.data && meta.data.url;
  const mime = (meta.data && meta.data.mime_type) || '';
  if (!url) throw new Error('WhatsApp media URL missing');
  const file = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: MAX_MEDIA_BYTES,
    maxBodyLength: MAX_MEDIA_BYTES,
  });
  return { buffer: Buffer.from(file.data), mime: mime || file.headers['content-type'] || '' };
}

// Free-form text reply. Allowed only inside the 24h customer-service window
// (i.e. after the user has messaged us — which is exactly the inbound case).
async function sendText(settings, toPhone, text) {
  if (!isConfigured(settings)) return { sent: false, skipped: 'not_configured' };
  const to = normalizePhone(toPhone);
  if (!to) return { sent: false, skipped: 'no_phone' };
  const version = settings.metaGraphVersion || 'v21.0';
  try {
    await axios.post(
      `https://graph.facebook.com/${version}/${settings.whatsappPhoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(text || '') } },
      { headers: { Authorization: `Bearer ${settings.whatsappAccessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return { sent: true };
  } catch (err) {
    console.error('[whatsapp] text reply failed:', err.response?.data?.error?.message || err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = {
  isConfigured, isInboundConfigured, sendResumeRequest, normalizePhone, buildTemplateBody,
  verifyWebhookSignature, parseInboundMessages, downloadMedia, sendText,
};
