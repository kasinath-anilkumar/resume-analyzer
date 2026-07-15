// Server-side geocoding for the candidate distance filter.
//
// Locations are SEARCHED and resolved to coordinates by a geocoding package
// (`node-geocoder` with the OpenStreetMap / Nominatim provider). There are NO
// hard-coded place names or coordinates and no alias table — the provider
// understands common names, spellings and aliases natively (Bangalore→Bengaluru,
// Trivandrum→Thiruvananthapuram, "Kochi, Kerala"…) and returns the coordinates,
// which we then use to compute great-circle distance.
//
// Nominatim asks for ≤1 request/second and a valid User-Agent, so:
//   • every resolved location is CACHED (candidates share locations, so the
//     cache warms fast and repeated lookups are free), and
//   • cache misses are resolved in a THROTTLED BACKGROUND QUEUE — the request
//     path never blocks on a slow network call; distance appears for a location
//     once it's resolved (the candidate list auto-refreshes).

const USER_AGENT = 'ParakkatATS/1.0 (recruitment distance filter)';
const MIN_INTERVAL_MS = 1100; // Nominatim usage policy: ≤ 1 request / second

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => {
  const t = setTimeout(r, ms);
  if (t.unref) t.unref(); // don't keep the process alive just for the throttle
});

// cache: norm(location) -> { lat, lon }  (resolved) | null (searched, not found)
//        (a key ABSENT from the cache means "not looked up yet")
const cache = new Map();
const queued = new Set(); // locations waiting in / moving through the queue
const queue = [];
let pumping = false;

// Lazily create the geocoder (so tests can inject a fake before first use, and
// the package isn't required until actually needed).
let geocoderInstance = null;
function geocoder() {
  if (!geocoderInstance) {
    const NodeGeocoder = require('node-geocoder');
    geocoderInstance = NodeGeocoder({
      provider: process.env.GEOCODER_PROVIDER || 'openstreetmap',
      headers: { 'User-Agent': USER_AGENT },
    });
  }
  return geocoderInstance;
}
// Test seam: inject a fake `{ geocode(query) -> [{ latitude, longitude }] }`.
function __setGeocoder(fake) {
  geocoderInstance = fake;
}

const toCoords = (res) => {
  const hit = Array.isArray(res) ? res[0] : null;
  if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;
  return { lat: hit.latitude, lon: hit.longitude };
};

// Synchronous cache read. Returns { lat, lon } | null (searched, not found) |
// undefined (not looked up yet).
function peek(location) {
  const key = norm(location);
  if (!key) return null;
  return cache.has(key) ? cache.get(key) : undefined;
}

// Resolve one location now (await). Caches the result. Never throws — returns
// undefined on a transient network error (left uncached so it can be retried).
async function geocodeOne(location) {
  const key = norm(location);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  try {
    const coords = toCoords(await geocoder().geocode(key));
    cache.set(key, coords); // coords or null (searched, not found)
    return coords;
  } catch (_) {
    return undefined; // transient — do not cache, allow a later retry
  }
}

// Enqueue locations for background resolution (deduped against the cache and the
// in-flight set). Non-blocking.
function warm(locations) {
  for (const loc of locations || []) {
    const key = norm(loc);
    if (!key || cache.has(key) || queued.has(key)) continue;
    queued.add(key);
    queue.push(key);
  }
  pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const key = queue.shift();
      if (cache.has(key)) { queued.delete(key); continue; }
      try {
        cache.set(key, toCoords(await geocoder().geocode(key)));
      } catch (_) {
        // transient — leave uncached so a future warm() retries it
      }
      queued.delete(key);
      await sleep(MIN_INTERVAL_MS); // respect the rate limit
    }
  } finally {
    pumping = false;
  }
}

// Great-circle distance in kilometres between two { lat, lon } points (rounded).
function distanceKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

module.exports = { geocodeOne, peek, warm, distanceKm, __setGeocoder };
