// Curated location dataset with coordinates. India-focused (Parakkat operates
// across India, HQ in Kochi) plus Gulf/global metros where Indian applicants
// commonly work. Used for BOTH the location autocomplete suggestions AND the
// distance math on the candidate filter — no geocoding API, no key, no rate
// limits. Locations not in this list can still be typed; they simply have no
// coordinates (sorted last when sorting by distance). Extend freely.
export const CITIES = [
  // Kerala (HQ region)
  { name: 'Kochi, Kerala', lat: 9.9312, lon: 76.2673 },
  { name: 'Thiruvananthapuram, Kerala', lat: 8.5241, lon: 76.9366 },
  { name: 'Kozhikode, Kerala', lat: 11.2588, lon: 75.7804 },
  { name: 'Thrissur, Kerala', lat: 10.5276, lon: 76.2144 },
  { name: 'Kollam, Kerala', lat: 8.8932, lon: 76.6141 },
  { name: 'Kannur, Kerala', lat: 11.8745, lon: 75.3704 },
  { name: 'Kottayam, Kerala', lat: 9.5916, lon: 76.5222 },
  { name: 'Palakkad, Kerala', lat: 10.7867, lon: 76.6548 },
  { name: 'Alappuzha, Kerala', lat: 9.4981, lon: 76.3388 },
  { name: 'Malappuram, Kerala', lat: 11.0510, lon: 76.0711 },
  { name: 'Kasaragod, Kerala', lat: 12.4996, lon: 74.9869 },
  { name: 'Pathanamthitta, Kerala', lat: 9.2648, lon: 76.7870 },
  // Major Indian metros / cities
  { name: 'Mumbai, Maharashtra', lat: 19.0760, lon: 72.8777 },
  { name: 'Delhi', lat: 28.7041, lon: 77.1025 },
  { name: 'Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad, Telangana', lat: 17.3850, lon: 78.4867 },
  { name: 'Chennai, Tamil Nadu', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata, West Bengal', lat: 22.5726, lon: 88.3639 },
  { name: 'Pune, Maharashtra', lat: 18.5204, lon: 73.8567 },
  { name: 'Ahmedabad, Gujarat', lat: 23.0225, lon: 72.5714 },
  { name: 'Jaipur, Rajasthan', lat: 26.9124, lon: 75.7873 },
  { name: 'Surat, Gujarat', lat: 21.1702, lon: 72.8311 },
  { name: 'Lucknow, Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  { name: 'Kanpur, Uttar Pradesh', lat: 26.4499, lon: 80.3319 },
  { name: 'Nagpur, Maharashtra', lat: 21.1458, lon: 79.0882 },
  { name: 'Indore, Madhya Pradesh', lat: 22.7196, lon: 75.8577 },
  { name: 'Coimbatore, Tamil Nadu', lat: 11.0168, lon: 76.9558 },
  { name: 'Madurai, Tamil Nadu', lat: 9.9252, lon: 78.1198 },
  { name: 'Visakhapatnam, Andhra Pradesh', lat: 17.6868, lon: 83.2185 },
  { name: 'Bhopal, Madhya Pradesh', lat: 23.2599, lon: 77.4126 },
  { name: 'Patna, Bihar', lat: 25.5941, lon: 85.1376 },
  { name: 'Vadodara, Gujarat', lat: 22.3072, lon: 73.1812 },
  { name: 'Ludhiana, Punjab', lat: 30.9010, lon: 75.8573 },
  { name: 'Agra, Uttar Pradesh', lat: 27.1767, lon: 78.0081 },
  { name: 'Nashik, Maharashtra', lat: 19.9975, lon: 73.7898 },
  { name: 'Rajkot, Gujarat', lat: 22.3039, lon: 70.8022 },
  { name: 'Varanasi, Uttar Pradesh', lat: 25.3176, lon: 82.9739 },
  { name: 'Amritsar, Punjab', lat: 31.6340, lon: 74.8723 },
  { name: 'Ranchi, Jharkhand', lat: 23.3441, lon: 85.3096 },
  { name: 'Jodhpur, Rajasthan', lat: 26.2389, lon: 73.0243 },
  { name: 'Guwahati, Assam', lat: 26.1445, lon: 91.7362 },
  { name: 'Chandigarh', lat: 30.7333, lon: 76.7794 },
  { name: 'Mysuru, Karnataka', lat: 12.2958, lon: 76.6394 },
  { name: 'Mangaluru, Karnataka', lat: 12.9141, lon: 74.8560 },
  { name: 'Tiruchirappalli, Tamil Nadu', lat: 10.7905, lon: 78.7047 },
  { name: 'Bhubaneswar, Odisha', lat: 20.2961, lon: 85.8245 },
  { name: 'Dehradun, Uttarakhand', lat: 30.3165, lon: 78.0322 },
  { name: 'Noida, Uttar Pradesh', lat: 28.5355, lon: 77.3910 },
  { name: 'Gurugram, Haryana', lat: 28.4595, lon: 77.0266 },
  { name: 'Goa', lat: 15.2993, lon: 74.1240 },
  // Gulf / global metros
  { name: 'Dubai, UAE', lat: 25.2048, lon: 55.2708 },
  { name: 'Abu Dhabi, UAE', lat: 24.4539, lon: 54.3773 },
  { name: 'Sharjah, UAE', lat: 25.3463, lon: 55.4209 },
  { name: 'Doha, Qatar', lat: 25.2854, lon: 51.5310 },
  { name: 'Riyadh, Saudi Arabia', lat: 24.7136, lon: 46.6753 },
  { name: 'Muscat, Oman', lat: 23.5880, lon: 58.3829 },
  { name: 'Kuwait City, Kuwait', lat: 29.3759, lon: 47.9774 },
  { name: 'Manama, Bahrain', lat: 26.2285, lon: 50.5860 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'London, UK', lat: 51.5074, lon: -0.1278 },
  { name: 'New York, USA', lat: 40.7128, lon: -74.0060 },
  { name: 'Toronto, Canada', lat: 43.6532, lon: -79.3832 },
  { name: 'Sydney, Australia', lat: -33.8688, lon: 151.2093 },
];

// Just the names — for <datalist> autocomplete suggestions.
export const CITY_SUGGESTIONS = CITIES.map((c) => c.name);

// Primary city token (before the first comma), lowercased, for fuzzy matching.
const primary = (name) => String(name).split(',')[0].trim().toLowerCase();

// Resolve a free-text location ("Kochi", "kochi, kerala", "Ernakulam Kochi") to
// coordinates by matching a known city name. Returns { lat, lon } or null.
export const coordsFor = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  // Prefer the longest primary-token match so "New Delhi" doesn't match "Delhi"
  // before a more specific entry, etc.
  let best = null;
  for (const c of CITIES) {
    const tok = primary(c.name);
    if (tok && t.includes(tok) && (!best || tok.length > best._len)) {
      best = { lat: c.lat, lon: c.lon, _len: tok.length };
    }
  }
  return best ? { lat: best.lat, lon: best.lon } : null;
};

// Great-circle distance in kilometres between two { lat, lon } points.
export const haversineKm = (a, b) => {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

// Distance (km) between two free-text locations, or null if either is unknown.
export const distanceBetween = (locA, locB) => {
  const a = coordsFor(locA);
  const b = coordsFor(locB);
  return a && b ? haversineKm(a, b) : null;
};
