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

const TEMPLATE_LANG = 'en_US'; // change if the approved template is another locale

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

module.exports = { isConfigured, sendResumeRequest, normalizePhone, buildTemplateBody };
