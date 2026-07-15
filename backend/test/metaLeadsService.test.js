const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mapLeadToCandidate, _humanize } = require('../services/metaLeadsService');

test('mapLeadToCandidate extracts standard fields + custom answers', () => {
  const lead = {
    id: '99887766',
    created_time: '2026-07-15T09:00:00+0000',
    field_data: [
      { name: 'full_name', values: ['Aisha Rahman'] },
      { name: 'email', values: ['AISHA@Example.com'] },
      { name: 'phone_number', values: ['+91 98765 43210'] },
      { name: 'years_of_experience?', values: ['5'] },
      { name: 'why_this_role?', values: ['I love jewellery design'] },
    ],
  };
  const c = mapLeadToCandidate(lead);
  assert.equal(c.leadMetaId, '99887766');
  assert.equal(c.name, 'Aisha Rahman');
  assert.equal(c.email, 'aisha@example.com'); // lowercased
  assert.equal(c.phone, '+91 98765 43210');
  assert.equal(c.createdTime, '2026-07-15T09:00:00+0000');
  assert.deepEqual(c.screeningAnswers, [
    { question: 'Years of experience', answer: '5' },
    { question: 'Why this role', answer: 'I love jewellery design' },
  ]);
});

test('mapLeadToCandidate falls back to first + last name', () => {
  const c = mapLeadToCandidate({
    id: '1', field_data: [
      { name: 'first_name', values: ['Ravi'] },
      { name: 'last_name', values: ['Kumar'] },
      { name: 'email', values: ['ravi@x.com'] },
    ],
  });
  assert.equal(c.name, 'Ravi Kumar');
  assert.equal(c.email, 'ravi@x.com');
  assert.equal(c.phone, '');
  assert.deepEqual(c.screeningAnswers, []);
});

test('mapLeadToCandidate tolerates missing/empty fields', () => {
  assert.deepEqual(mapLeadToCandidate({}), {
    leadMetaId: '', createdTime: null, name: '', email: '', phone: '', screeningAnswers: [],
  });
  const c = mapLeadToCandidate({ id: '2', field_data: [{ name: 'email', values: [] }] });
  assert.equal(c.email, ''); // empty values array ignored
  assert.equal(c.leadMetaId, '2');
});

test('humanize turns a Meta field key into a readable question', () => {
  assert.equal(_humanize('years_of_experience?'), 'Years of experience');
  assert.equal(_humanize('current_ctc'), 'Current ctc');
  assert.equal(_humanize(''), '');
});
