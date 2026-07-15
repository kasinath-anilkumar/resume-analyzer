const { test } = require('node:test');
const assert = require('node:assert');
const { geocode, distanceKm, distanceBetween } = require('../utils/geocode');

test('geocode: resolves curated cities and common aliases', () => {
  for (const name of ['Kochi', 'Cochin', 'Ernakulam', 'Trivandrum', 'Calicut', 'Bangalore', 'Bombay', 'Dubai']) {
    const c = geocode(name);
    assert.ok(c && typeof c.lat === 'number' && typeof c.lon === 'number', `should resolve: ${name}`);
  }
  // Aliases point at the same place as their canonical name.
  assert.deepStrictEqual(geocode('Cochin'), geocode('Kochi'));
  assert.deepStrictEqual(geocode('Trivandrum'), geocode('Thiruvananthapuram'));
  assert.deepStrictEqual(geocode('Bangalore'), geocode('Bengaluru'));
});

test('geocode: handles free-text with state suffixes and areas', () => {
  assert.ok(geocode('kochi, kerala'));
  assert.ok(geocode('Whitefield, Bangalore'));       // area, city → matches city
  assert.deepStrictEqual(geocode('New Delhi'), { lat: 28.6139, lon: 77.2090 }); // distinct from Delhi
  assert.notDeepStrictEqual(geocode('New Delhi'), geocode('Delhi'));
});

test('geocode: word-boundary matching avoids false positives', () => {
  assert.strictEqual(geocode('Goalpara'), null); // must NOT match "Goa"
  assert.ok(geocode('Goa'));
});

test('geocode: unknown / empty locations return null', () => {
  assert.strictEqual(geocode(''), null);
  assert.strictEqual(geocode(null), null);
  assert.strictEqual(geocode('Remote'), null);
  assert.strictEqual(geocode('Work from home'), null);
});

test('distanceKm: great-circle distance is accurate and symmetric', () => {
  const kochi = geocode('Kochi');
  const tvm = geocode('Trivandrum');
  const d = distanceKm(kochi, tvm);
  assert.ok(d >= 160 && d <= 190, `Kochi↔Trivandrum ~173km, got ${d}`);
  assert.strictEqual(distanceKm(kochi, tvm), distanceKm(tvm, kochi));
  assert.strictEqual(distanceKm(kochi, kochi), 0);
  assert.strictEqual(distanceKm(null, kochi), null);
});

test('distanceBetween: end-to-end from two free-text locations', () => {
  const d = distanceBetween('Kottayam', 'Kochi, Kerala');
  assert.ok(d >= 35 && d <= 60, `Kottayam↔Kochi ~47km, got ${d}`);
  assert.strictEqual(distanceBetween('Kochi', 'Remote'), null); // one side unknown
});
