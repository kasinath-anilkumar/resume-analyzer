// URL sanitization — the single source of truth for "is this URL safe to store
// and later render into an <a href>". Applicant/resume-derived URLs
// (portfolio/LinkedIn/GitHub/project links) are attacker-influenced, so a
// javascript: / data: / vbscript: scheme rendered into an href would run script
// in a recruiter's authenticated session. We allow ONLY web + mail schemes;
// anything else (or garbage) collapses to an empty string.
//
// Applied on WRITE (candidateRepo.toRow, applicantRepo.updateProfile,
// aiService normalization) so nothing dangerous is ever persisted; the frontend
// re-checks on render as defense-in-depth for any legacy rows.

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

// Drop control chars (0x00-0x20) + DEL (0x7f) that can smuggle a scheme past the
// check, e.g. a tab inside "java<TAB>script:alert(1)" or a leading newline.
const stripControl = (s) => {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code > 0x20 && code !== 0x7f) out += s[i];
  }
  return out;
};

// Returns a safe URL string, or '' if the input is missing/unsafe/unparseable.
// Scheme-relative ("//evil.com") and bare-domain ("example.com/x") inputs are
// normalized to https:// so they stay usable without allowing a dangerous scheme.
function sanitizeUrl(input) {
  if (input == null) return '';
  let s = stripControl(String(input).trim());
  if (!s) return '';

  // Bare domain or scheme-relative -> assume https.
  if (s.indexOf('//') === 0) {
    s = 'https:' + s;
  } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
    // No scheme at all. Treat an email-looking value as mailto, else https.
    s = (/^[^@]+@[^@]+\.[^@]+$/.test(s) ? 'mailto:' : 'https://') + s;
  }

  let parsed;
  try {
    parsed = new URL(s);
  } catch (_) {
    return '';
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol.toLowerCase())) return '';
  return parsed.href;
}

module.exports = { sanitizeUrl };
