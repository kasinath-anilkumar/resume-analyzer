// Server-side geocoding for the candidate distance filter.
//
// Resolves a free-text location ("Kochi", "cochin, kerala", "Bangalore") to
// coordinates, then callers compute the great-circle distance between a job's
// location and each candidate's location.
//
// Strategy (offline — no API key, no rate limits, works in CI):
//   1. A CURATED override table for the places that actually matter to this
//      business (Kerala + Indian metros + Gulf) INCLUDING common aliases the
//      canonical datasets get wrong (Cochin/Ernakulam→Kochi, Trivandrum,
//      Calicut, Bangalore, Bombay, Madras, Gurgaon…). This is authoritative.
//   2. Fall back to the `all-the-cities` package (~135k GeoNames cities) for the
//      long tail, preferring India, then the Gulf, then the most-populous match.
// Results are cached by input string so repeated locations cost nothing.

// --- Curated overrides: token -> { lat, lon } -------------------------------
// Keyed by a lowercase token that we look for INSIDE the free-text location.
// Longest matching token wins (so "new delhi" beats "delhi").
const OVERRIDES = {
  // Kerala (HQ region)
  'kochi': { lat: 9.9312, lon: 76.2673 },
  'cochin': { lat: 9.9312, lon: 76.2673 },
  'ernakulam': { lat: 9.9816, lon: 76.2999 },
  'thiruvananthapuram': { lat: 8.5241, lon: 76.9366 },
  'trivandrum': { lat: 8.5241, lon: 76.9366 },
  'kozhikode': { lat: 11.2588, lon: 75.7804 },
  'calicut': { lat: 11.2588, lon: 75.7804 },
  'thrissur': { lat: 10.5276, lon: 76.2144 },
  'trichur': { lat: 10.5276, lon: 76.2144 },
  'kollam': { lat: 8.8932, lon: 76.6141 },
  'quilon': { lat: 8.8932, lon: 76.6141 },
  'kannur': { lat: 11.8745, lon: 75.3704 },
  'cannanore': { lat: 11.8745, lon: 75.3704 },
  'kottayam': { lat: 9.5916, lon: 76.5222 },
  'palakkad': { lat: 10.7867, lon: 76.6548 },
  'palghat': { lat: 10.7867, lon: 76.6548 },
  'alappuzha': { lat: 9.4981, lon: 76.3388 },
  'alleppey': { lat: 9.4981, lon: 76.3388 },
  'malappuram': { lat: 11.0510, lon: 76.0711 },
  'kasaragod': { lat: 12.4996, lon: 74.9869 },
  'pathanamthitta': { lat: 9.2648, lon: 76.7870 },
  'idukki': { lat: 9.8497, lon: 76.9811 },
  'wayanad': { lat: 11.6854, lon: 76.1320 },
  // Major Indian metros / cities (+ common older names)
  'mumbai': { lat: 19.0760, lon: 72.8777 },
  'bombay': { lat: 19.0760, lon: 72.8777 },
  'delhi': { lat: 28.7041, lon: 77.1025 },
  'new delhi': { lat: 28.6139, lon: 77.2090 },
  'bengaluru': { lat: 12.9716, lon: 77.5946 },
  'bangalore': { lat: 12.9716, lon: 77.5946 },
  'hyderabad': { lat: 17.3850, lon: 78.4867 },
  'chennai': { lat: 13.0827, lon: 80.2707 },
  'madras': { lat: 13.0827, lon: 80.2707 },
  'kolkata': { lat: 22.5726, lon: 88.3639 },
  'calcutta': { lat: 22.5726, lon: 88.3639 },
  'pune': { lat: 18.5204, lon: 73.8567 },
  'ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'jaipur': { lat: 26.9124, lon: 75.7873 },
  'surat': { lat: 21.1702, lon: 72.8311 },
  'lucknow': { lat: 26.8467, lon: 80.9462 },
  'kanpur': { lat: 26.4499, lon: 80.3319 },
  'nagpur': { lat: 21.1458, lon: 79.0882 },
  'indore': { lat: 22.7196, lon: 75.8577 },
  'coimbatore': { lat: 11.0168, lon: 76.9558 },
  'madurai': { lat: 9.9252, lon: 78.1198 },
  'visakhapatnam': { lat: 17.6868, lon: 83.2185 },
  'vizag': { lat: 17.6868, lon: 83.2185 },
  'bhopal': { lat: 23.2599, lon: 77.4126 },
  'patna': { lat: 25.5941, lon: 85.1376 },
  'vadodara': { lat: 22.3072, lon: 73.1812 },
  'baroda': { lat: 22.3072, lon: 73.1812 },
  'ludhiana': { lat: 30.9010, lon: 75.8573 },
  'agra': { lat: 27.1767, lon: 78.0081 },
  'nashik': { lat: 19.9975, lon: 73.7898 },
  'rajkot': { lat: 22.3039, lon: 70.8022 },
  'varanasi': { lat: 25.3176, lon: 82.9739 },
  'amritsar': { lat: 31.6340, lon: 74.8723 },
  'ranchi': { lat: 23.3441, lon: 85.3096 },
  'jodhpur': { lat: 26.2389, lon: 73.0243 },
  'guwahati': { lat: 26.1445, lon: 91.7362 },
  'chandigarh': { lat: 30.7333, lon: 76.7794 },
  'mysuru': { lat: 12.2958, lon: 76.6394 },
  'mysore': { lat: 12.2958, lon: 76.6394 },
  'mangaluru': { lat: 12.9141, lon: 74.8560 },
  'mangalore': { lat: 12.9141, lon: 74.8560 },
  'tiruchirappalli': { lat: 10.7905, lon: 78.7047 },
  'trichy': { lat: 10.7905, lon: 78.7047 },
  'bhubaneswar': { lat: 20.2961, lon: 85.8245 },
  'dehradun': { lat: 30.3165, lon: 78.0322 },
  'noida': { lat: 28.5355, lon: 77.3910 },
  'gurugram': { lat: 28.4595, lon: 77.0266 },
  'gurgaon': { lat: 28.4595, lon: 77.0266 },
  'goa': { lat: 15.2993, lon: 74.1240 },
  'panaji': { lat: 15.4909, lon: 73.8278 },
  // Gulf / global metros where Indian applicants commonly work
  'dubai': { lat: 25.2048, lon: 55.2708 },
  'abu dhabi': { lat: 24.4539, lon: 54.3773 },
  'sharjah': { lat: 25.3463, lon: 55.4209 },
  'doha': { lat: 25.2854, lon: 51.5310 },
  'riyadh': { lat: 24.7136, lon: 46.6753 },
  'jeddah': { lat: 21.4858, lon: 39.1925 },
  'dammam': { lat: 26.3927, lon: 49.9777 },
  'muscat': { lat: 23.5880, lon: 58.3829 },
  'kuwait': { lat: 29.3759, lon: 47.9774 },
  'manama': { lat: 26.2285, lon: 50.5860 },
  'bahrain': { lat: 26.0667, lon: 50.5577 },
  'singapore': { lat: 1.3521, lon: 103.8198 },
  'london': { lat: 51.5074, lon: -0.1278 },
  'new york': { lat: 40.7128, lon: -74.0060 },
  'toronto': { lat: 43.6532, lon: -79.3832 },
  'sydney': { lat: -33.8688, lon: 151.2093 },
};

// Longest-token-first so multi-word tokens ("new delhi", "abu dhabi") are tried
// before shorter ones that they contain. Each token is matched as a WHOLE WORD
// (\b…\b) so a short token can't false-match inside another word (e.g. "goa"
// must not match "Goalpara").
const OVERRIDE_TOKENS = Object.keys(OVERRIDES)
  .sort((a, b) => b.length - a.length)
  .map((tok) => ({ tok, re: new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) }));

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// --- all-the-cities fallback (lazy: only loaded on first cache miss) ---------
const GULF = new Set(['AE', 'QA', 'SA', 'OM', 'KW', 'BH']);
let cityIndex = null; // Map<lowercaseName, { lat, lon, rank, population }>

function buildIndex() {
  const index = new Map();
  let cities;
  try {
    cities = require('all-the-cities');
  } catch (_) {
    return index; // package unavailable → overrides-only
  }
  // Preference rank: India (2) > Gulf (1) > rest (0); ties broken by population.
  const rankOf = (country) => (country === 'IN' ? 2 : GULF.has(country) ? 1 : 0);
  for (const c of cities) {
    const key = norm(c.name);
    if (!key) continue;
    const rank = rankOf(c.country);
    const prev = index.get(key);
    if (!prev || rank > prev.rank || (rank === prev.rank && c.population > prev.population)) {
      const [lon, lat] = c.loc.coordinates;
      index.set(key, { lat, lon, rank, population: c.population });
    }
  }
  return index;
}

function fallbackLookup(text) {
  if (!cityIndex) cityIndex = buildIndex();
  if (cityIndex.size === 0) return null;
  const t = norm(text);
  // Try the whole string, then the primary token (before the first comma), then
  // each remaining comma-separated part (so "Whitefield, Bangalore" still hits).
  const candidates = [t, t.split(',')[0].trim(), ...t.split(',').map((s) => s.trim())];
  for (const key of candidates) {
    if (key && cityIndex.has(key)) {
      const { lat, lon } = cityIndex.get(key);
      return { lat, lon };
    }
  }
  return null;
}

// --- Public API --------------------------------------------------------------
const cache = new Map(); // input(lowercased) -> { lat, lon } | null

// Resolve a free-text location to { lat, lon }, or null if unknown.
function geocode(text) {
  const key = norm(text);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  let result = null;
  // 1) Curated overrides — longest whole-word token in the text wins.
  for (const { tok, re } of OVERRIDE_TOKENS) {
    if (re.test(key)) { result = OVERRIDES[tok]; break; }
  }
  // 2) Package fallback for everything else.
  if (!result) result = fallbackLookup(key);

  const coords = result ? { lat: result.lat, lon: result.lon } : null;
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
