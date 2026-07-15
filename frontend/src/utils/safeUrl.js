// Returns a URL safe to put in an <a href>, or '' if unsafe/empty.
// Blocks javascript:/data:/vbscript: (stored-XSS vectors); allows http/https/mailto.
// Bare domains ("example.com/x") and scheme-relative ("//x.com") normalize to https.
const ALLOWED = new Set(['http:', 'https:', 'mailto:']);
export function safeUrl(input) {
  if (input == null) return '';
  let s = String(input).trim();
  // strip control chars + spaces that smuggle a scheme ("java\tscript:")
  s = s.split('').filter((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f).join('');
  if (!s) return '';
  if (s.indexOf('//') === 0) s = 'https:' + s;
  else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
    s = (/^[^@]+@[^@]+\.[^@]+$/.test(s) ? 'mailto:' : 'https://') + s;
  }
  try {
    const u = new URL(s);
    return ALLOWED.has(u.protocol.toLowerCase()) ? u.href : '';
  } catch { return ''; }
}
export default safeUrl;
