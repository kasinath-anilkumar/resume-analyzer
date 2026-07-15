// Meta Lead Ads Graph API client.
//
// Fetches lead-form submissions from Meta so they can be ingested as candidates.
// Modeled on the resilience of aiService (reuses AIService.withRetry for
// backoff) and classifies errors so the Settings "Test connection" path can show
// a useful message while the background poll can swallow failures.
//
// Requires a Page access token with `leads_retrieval`. All config comes from the
// `settings` row (SettingsRepo), never env — the admin pastes it in the UI.

const axios = require('axios');
const AIService = require('./aiService');

const graphBase = (settings) => `https://graph.facebook.com/${settings.metaGraphVersion || 'v21.0'}`;

const isConfigured = (settings) => Boolean(settings && settings.metaAccessToken && settings.metaPageId);

// Classify a Graph API error into an actionable, non-leaky message.
const metaError = (error) => {
  const status = error.response?.status;
  const apiMsg = error.response?.data?.error?.message;
  let code = 'META_FAILED';
  let message = apiMsg || error.message || 'Meta request failed.';
  if (status === 401 || status === 403 || error.response?.data?.error?.code === 190) {
    code = 'META_TOKEN_INVALID';
    message = 'Meta rejected the access token (expired, revoked, or missing leads_retrieval permission).';
  } else if (status === 429 || error.response?.data?.error?.code === 4 || error.response?.data?.error?.code === 17) {
    code = 'META_RATE_LIMIT';
    message = 'Meta rate limit reached. Try again shortly.';
  }
  const e = new Error(message);
  e.status = status || 502;
  e.code = code;
  e.metaClassified = true;
  return e;
};

async function graphGet(url, params) {
  try {
    return await AIService.withRetry(() =>
      axios.get(url, { params, timeout: 15000 })
    );
  } catch (err) {
    if (err.metaClassified) throw err;
    throw metaError(err);
  }
}

// Validate the token + page by reading the page name. Returns { pageName,
// leadgenTosAccepted }. Throws a classified error if the token is bad.
async function testConnection(settings) {
  const res = await graphGet(`${graphBase(settings)}/${settings.metaPageId}`, {
    fields: 'name,leadgen_tos_accepted',
    access_token: settings.metaAccessToken,
  });
  return {
    pageName: res.data?.name || '',
    leadgenTosAccepted: Boolean(res.data?.leadgen_tos_accepted),
  };
}

// List the Page's lead forms (for the Settings form→job mapping UI).
async function listLeadForms(settings) {
  const forms = [];
  let url = `${graphBase(settings)}/${settings.metaPageId}/leadgen_forms`;
  let params = { fields: 'id,name,status', limit: 100, access_token: settings.metaAccessToken };
  // Follow paging.next up to a sane cap.
  for (let page = 0; page < 20 && url; page++) {
    const res = await graphGet(url, params);
    (res.data?.data || []).forEach((f) => forms.push({ id: f.id, name: f.name || `Form ${f.id}`, status: f.status || '' }));
    url = res.data?.paging?.next || null;
    params = undefined; // the `next` URL already carries the querystring
  }
  return forms;
}

// Fetch leads for one form created strictly AFTER `sinceUnix` (epoch seconds),
// oldest → newest, following pagination. Returns raw Meta lead objects.
async function fetchLeadsSince(settings, formId, sinceUnix) {
  const leads = [];
  let url = `${graphBase(settings)}/${formId}/leads`;
  const filtering = sinceUnix
    ? JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(sinceUnix) }])
    : undefined;
  let params = {
    fields: 'id,created_time,field_data',
    limit: 100,
    access_token: settings.metaAccessToken,
    ...(filtering ? { filtering } : {}),
  };
  for (let page = 0; page < 50 && url; page++) {
    const res = await graphGet(url, params);
    (res.data?.data || []).forEach((l) => leads.push(l));
    url = res.data?.paging?.next || null;
    params = undefined;
  }
  return leads;
}

// --- Pure mapping (unit-tested) ---------------------------------------------
// Meta standard field names for the built-in questions. Everything else becomes
// a screening answer.
const NAME_KEYS = new Set(['full_name', 'name']);
const EMAIL_KEYS = new Set(['email']);
const PHONE_KEYS = new Set(['phone_number', 'phone']);

const humanize = (key) =>
  String(key || '')
    .replace(/[_?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

const firstValue = (fd) => (Array.isArray(fd?.values) && fd.values.length ? String(fd.values[0]).trim() : '');

/**
 * Convert a raw Meta lead into the candidate-shaped fields we ingest.
 * @returns {{ leadMetaId, createdTime, name, email, phone, screeningAnswers: {question,answer}[] }}
 */
function mapLeadToCandidate(lead = {}) {
  const fields = Array.isArray(lead.field_data) ? lead.field_data : [];
  let name = '';
  let firstName = '';
  let lastName = '';
  let email = '';
  let phone = '';
  const screeningAnswers = [];

  for (const fd of fields) {
    const key = String(fd?.name || '').toLowerCase();
    const val = firstValue(fd);
    if (!val) continue;
    if (NAME_KEYS.has(key)) name = val;
    else if (key === 'first_name') firstName = val;
    else if (key === 'last_name') lastName = val;
    else if (EMAIL_KEYS.has(key)) email = val;
    else if (PHONE_KEYS.has(key)) phone = val;
    else screeningAnswers.push({ question: humanize(fd.name), answer: val });
  }
  if (!name) name = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    leadMetaId: lead.id ? String(lead.id) : '',
    createdTime: lead.created_time || null,
    name,
    email: email.toLowerCase(),
    phone,
    screeningAnswers,
  };
}

module.exports = {
  isConfigured, testConnection, listLeadForms, fetchLeadsSince, mapLeadToCandidate,
  _humanize: humanize, _metaError: metaError,
};
