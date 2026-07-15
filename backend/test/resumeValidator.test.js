const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validate, hasUsableContact, hasContactInfo } = require('../services/resumeValidator');

const RESUME = `
John Doe — Software Engineer. john@example.com | +91 90000 00000
SUMMARY: Backend engineer with 5 years of experience.
EXPERIENCE: Senior Developer at Acme Corp (2020-2024) — developed and managed APIs.
EDUCATION: Bachelor of Technology, XYZ University, 2019.
SKILLS: JavaScript, Node.js, PostgreSQL, Docker.
PROJECTS: Built an internal analytics platform.
`;

const AADHAAR = `
Government of India
Unique Identification Authority of India
Name: Ramesh Kumar  DOB: 01/01/1990  Male
1234 5678 9012
Aadhaar - Address: 12 MG Road, Kochi, Kerala
`;

test('a real résumé passes', () => {
  const r = validate(RESUME);
  assert.equal(r.ok, true);
  assert.equal(r.category, 'resume');
});

test('an Aadhaar/ID card is rejected as an ID document', () => {
  const r = validate(AADHAAR);
  assert.equal(r.ok, false);
  assert.equal(r.category, 'id_document');
  assert.match(r.reason, /identity or official document/i);
});

test('near-empty / unreadable scan is rejected as too short', () => {
  const r = validate('scan copy 2');
  assert.equal(r.ok, false);
  assert.equal(r.category, 'too_short');
});

test('a document with no résumé sections is rejected', () => {
  const r = validate('This is a warranty card for a washing machine. Keep the bill safe for service claims within one year of purchase date. Model number ABC123 serial 99887766.');
  assert.equal(r.ok, false);
  assert.equal(r.category, 'not_resume');
});

test('a sparse fresher résumé still passes (bias toward accepting)', () => {
  const r = validate('Objective: seeking a role. Education: B.Sc, ABC College. Skills: Excel, Communication.');
  assert.equal(r.ok, true);
});

test('handles empty / non-string input', () => {
  assert.equal(validate('').ok, false);
  assert.equal(validate(null).ok, false);
  assert.equal(validate(undefined).ok, false);
});

test('hasUsableContact: real email or a phone with enough digits', () => {
  assert.equal(hasUsableContact('jane@example.com', ''), true);
  assert.equal(hasUsableContact('', '+91 98765 43210'), true);
  assert.equal(hasUsableContact('', '12345'), false);            // too few digits
  assert.equal(hasUsableContact('pending-123@pending.local', ''), false); // upload placeholder
  assert.equal(hasUsableContact('', ''), false);
});

test('hasContactInfo: finds an email or a phone-shaped number in text', () => {
  assert.equal(hasContactInfo('Contact: jane@example.com'), true);
  assert.equal(hasContactInfo('Phone: +91 98765-43210'), true);
  assert.equal(hasContactInfo('Skilled in Java and Python. 5 years experience.'), false);
  assert.equal(hasContactInfo('Graduated in 2019 with a 9.1 GPA'), false); // short numbers aren't phones
  assert.equal(hasContactInfo(''), false);
});
