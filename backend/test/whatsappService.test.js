const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildTemplateBody, normalizePhone, isConfigured } = require('../services/whatsappService');

test('normalizePhone strips everything but digits', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '919876543210');
  assert.equal(normalizePhone('(044) 1234 5678'), '04412345678');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone(null), '');
});

test('buildTemplateBody produces a valid Cloud API template payload with 3 ordered body params', () => {
  const body = buildTemplateBody({
    templateName: 'resume_request', to: '919876543210',
    name: 'Aisha', jobTitle: 'Bench Jeweller', uploadUrl: 'https://app/u/abc123',
  });
  assert.equal(body.messaging_product, 'whatsapp');
  assert.equal(body.to, '919876543210');
  assert.equal(body.type, 'template');
  assert.equal(body.template.name, 'resume_request');
  const params = body.template.components[0].parameters;
  assert.deepEqual(params.map((p) => p.text), ['Aisha', 'Bench Jeweller', 'https://app/u/abc123']);
  assert.ok(params.every((p) => p.type === 'text'));
});

test('buildTemplateBody supplies safe fallbacks for missing values', () => {
  const params = buildTemplateBody({ templateName: 't', to: '1', name: '', jobTitle: '', uploadUrl: '' })
    .template.components[0].parameters;
  assert.deepEqual(params.map((p) => p.text), ['there', 'the role', '']);
});

test('isConfigured requires token, phone id, and template name', () => {
  assert.equal(isConfigured({ whatsappAccessToken: 't', whatsappPhoneNumberId: 'p', whatsappTemplateName: 'n' }), true);
  assert.equal(isConfigured({ whatsappAccessToken: 't', whatsappPhoneNumberId: 'p' }), false);
  assert.equal(isConfigured({}), false);
  assert.equal(isConfigured(null), false);
});
