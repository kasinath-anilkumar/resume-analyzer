const { test } = require('node:test');
const assert = require('node:assert');
const geo = require('../utils/geocode');

// Inject a fake provider so tests are deterministic and hit NO network (the real
// OpenStreetMap/Nominatim provider is only used at runtime).
let calls = [];
const DATA = {
  kochi: [{ latitude: 9.9312, longitude: 76.2673 }],
  kottayam: [{ latitude: 9.5916, longitude: 76.5222 }],
  trivandrum: [{ latitude: 8.5241, longitude: 76.9366 }],
  'nowhere-xyz': [],
};
const fakeProvider = { geocode: async (q) => { calls.push(q); return DATA[q] || []; } };
geo.__setGeocoder(fakeProvider);

test('geocodeOne resolves via the provider and caches (no repeat network calls)', async () => {
  calls = [];
  const a = await geo.geocodeOne('Kochi');
  assert.deepStrictEqual(a, { lat: 9.9312, lon: 76.2673 });
  const b = await geo.geocodeOne('KOCHI  '); // same normalized key → cached
  assert.deepStrictEqual(b, a);
  assert.strictEqual(calls.length, 1);
});

test('peek reflects cache state (undefined → coords)', async () => {
  assert.strictEqual(geo.peek('Trivandrum'), undefined); // not looked up yet
  await geo.geocodeOne('Trivandrum');
  assert.deepStrictEqual(geo.peek('Trivandrum'), { lat: 8.5241, lon: 76.9366 });
});

test('a searched-but-not-found location caches as null', async () => {
  assert.strictEqual(await geo.geocodeOne('nowhere-xyz'), null);
  assert.strictEqual(geo.peek('nowhere-xyz'), null);
});

test('geocodeOne never throws on a provider error (returns undefined, uncached)', async () => {
  geo.__setGeocoder({ geocode: async () => { throw new Error('network down'); } });
  const r = await geo.geocodeOne('some-new-place');
  assert.strictEqual(r, undefined);
  assert.strictEqual(geo.peek('some-new-place'), undefined); // left uncached to retry
  geo.__setGeocoder(fakeProvider); // restore
});

test('warm resolves queued locations in the background, deduped', async () => {
  calls = [];
  geo.warm(['Kottayam', 'kottayam', '']); // dupes + empty ignored
  await new Promise((r) => setTimeout(r, 60)); // let the queue process the first item
  assert.deepStrictEqual(geo.peek('Kottayam'), { lat: 9.5916, lon: 76.5222 });
  assert.strictEqual(calls.length, 1);
});

test('distanceKm: accurate, symmetric, null-safe', () => {
  const kochi = { lat: 9.9312, lon: 76.2673 };
  const tvm = { lat: 8.5241, lon: 76.9366 };
  const d = geo.distanceKm(kochi, tvm);
  assert.ok(d >= 160 && d <= 190, `Kochi↔Trivandrum ~173km, got ${d}`);
  assert.strictEqual(geo.distanceKm(kochi, tvm), geo.distanceKm(tvm, kochi));
  assert.strictEqual(geo.distanceKm(kochi, kochi), 0);
  assert.strictEqual(geo.distanceKm(null, kochi), null);
});
