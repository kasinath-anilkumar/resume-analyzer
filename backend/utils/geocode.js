// Server-side geocoding for the candidate distance filter.
//
// Resolves a free-text location ("Kochi", "cochin, kerala", "Bangalore") to
// coordinates, so callers can compute the great-circle distance between a job's
// location and each candidate's location.
//
// COORDINATES COME FROM THE `all-the-cities` PACKAGE (~135k GeoNames cities —
// offline, no API key, no rate limits, works in CI). We add only:
//   • a small ALIAS map: common / older Indian names → the GeoNames canonical
//     name the dataset uses (Kochi→Cochin, Bangalore→Bengaluru, Trivandrum→
//     Thiruvananthapuram, Calicut→Kozhikode, Bombay→Mumbai…), and
//   • a tiny SUPPLEMENT for a handful of Kerala towns the package omits (below
//     its population cut-off) but that matter to this business.
// Results are cached by input string so repeated locations cost nothing.

// Common / older / vernacular names → the canonical name GeoNames stores.
const ALIASES = {
  kochi: 'cochin',
  ernakulam: 'ernakulam',        // (supplemented below — package lacks it)
  trivandrum: 'thiruvananthapuram',
  calicut: 'kozhikode',
  quilon: 'kollam',
  alleppey: 'alappuzha',
  cannanore: 'kannur',
  trichur: 'thrissur',
  palghat: 'palakkad',
  kalpetta: 'wayanad',
  bombay: 'mumbai',
  madras: 'chennai',
  calcutta: 'kolkata',
  bangalore: 'bengaluru',
  mysore: 'mysuru',
  mangalore: 'mangaluru',
  trichy: 'tiruchirappalli',
  pondicherry: 'puducherry',
  gurgaon: 'gurugram',
  baroda: 'vadodara',
  vizag: 'visakhapatnam',
  poona: 'pune',
  // A few non-Indian canonical-name fixes.
  'new york': 'new york city',
  nyc: 'new york city',
};

// The ONLY hard-coded coordinates: places `all-the-cities` doesn't include but
// that are real (Parakkat-relevant) locations. Given rank 3 so they always win
// a tie over a package match of the same token.
const SUPPLEMENT = {
  palakkad: { lat: 10.7867, lon: 76.6548 },
  kasaragod: { lat: 12.4996, lon: 74.9869 },
  pathanamthitta: { lat: 9.2648, lon: 76.7870 },
  wayanad: { lat: 11.6085, lon: 76.0847 },
  ernakulam: { lat: 9.9816, lon: 76.2999 },
  nagercoil: { lat: 8.1833, lon: 77.4119 },
};

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const canonical = (name) => ALIASES[name] || name;

// --- all-the-cities index (lazy: only built on first geocode) ----------------
const GULF = new Set(['AE', 'QA', 'SA', 'OM', 'KW', 'BH']);
// Preference rank: India (2) > Gulf (1) > rest (0). Ties → higher population.
const rankOf = (country) => (country === 'IN' ? 2 : GULF.has(country) ? 1 : 0);

let index = null; // Map<lowercaseName, { lat, lon, rank, population }>
function buildIndex() {
  const map = new Map();
  let cities;
  try {
    cities = require('all-the-cities');
  } catch (_) {
    return map; // package unavailable → SUPPLEMENT-only
  }
  for (const c of cities) {
    const key = norm(c.name);
    if (!key) continue;
    const rank = rankOf(c.country);
    const prev = map.get(key);
    if (!prev || rank > prev.rank || (rank === prev.rank && c.population > prev.population)) {
      const [lon, lat] = c.loc.coordinates;
      map.set(key, { lat, lon, rank, population: c.population });
    }
  }
  return map;
}

// Resolve ONE token to { lat, lon, rank, population } (or null). Supplement first
// (it fills package gaps), then the package by canonical name.
function resolveToken(token) {
  const name = canonical(token);
  if (SUPPLEMENT[name]) return { ...SUPPLEMENT[name], rank: 3, population: Infinity };
  if (!index) index = buildIndex();
  return index.get(name) || null;
}

const better = (a, b) => !b || a.rank > b.rank || (a.rank === b.rank && a.population > b.population);

// --- Public API --------------------------------------------------------------
const cache = new Map(); // input(lowercased) -> { lat, lon } | null

// Resolve a free-text location to { lat, lon }, or null if unknown.
function geocode(text) {
  const key = norm(text);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  // Primary pass: the whole string + each comma-separated part (these look like
  // real locations, so any country is accepted — "London, UK" resolves too). The
  // best match by rank+population wins, so "Kochi, Kerala" picks Kochi over the
  // state and "Whitefield, Bangalore" picks Bangalore over the neighbourhood.
  const parts = new Set([key, ...key.split(',').map((s) => s.trim()).filter(Boolean)]);
  let best = null;
  for (const p of parts) {
    const r = resolveToken(p);
    if (r && better(r, best)) best = r;
  }

  // Fallback pass: scan individual words / adjacent word-pairs, but ONLY accept
  // India/Gulf matches (rank ≥ 1). This lets "based in kochi" resolve while a
  // stray English word ("Remote", "Work from home") can't match a random city.
  if (!best) {
    const words = key.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    const derived = new Set(words);
    for (let i = 0; i < words.length - 1; i += 1) derived.add(`${words[i]} ${words[i + 1]}`);
    for (const p of derived) {
      const r = resolveToken(p);
      if (r && r.rank >= 1 && better(r, best)) best = r;
    }
  }

  const coords = best ? { lat: best.lat, lon: best.lon } : null;
  cache.set(key, coords);
  return coords;
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

// Distance (km) between two free-text locations, or null if either is unknown.
function distanceBetween(locA, locB) {
  return distanceKm(geocode(locA), geocode(locB));
}

module.exports = { geocode, distanceKm, distanceBetween };
