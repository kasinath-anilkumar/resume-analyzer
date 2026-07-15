// Résumé/CV gate — cheap, AI-free check that an uploaded document actually looks
// like a résumé BEFORE we spend an AI call analysing it. Catches the common junk:
// ID cards (Aadhaar/PAN/passport), near-empty scans, and documents with none of
// the sections a résumé always has.
//
// Deliberately biased toward ACCEPTING (a false reject blocks a real applicant),
// so it only rejects when it's fairly confident the file isn't a résumé. Pure +
// unit-tested. The reason strings are applicant-safe (shown in the portal).

// Strong "this is an official/ID document, not a résumé" markers.
const ID_DOC_SIGNALS = [
  'aadhaar', 'aadhar', 'आधार', 'unique identification authority', 'uidai',
  'government of india', 'permanent account number', 'income tax department',
  'driving licence', 'driving license', 'election commission', 'voter id',
  'republic of india', 'ration card', 'pan card', 'passport no',
];

// Sections/terms a résumé/CV/bio-data almost always contains.
const RESUME_SIGNALS = [
  'experience', 'education', 'skill', 'project', 'employment', 'work history',
  'objective', 'summary', 'career', 'qualification', 'curriculum vitae',
  'resume', 'résumé', 'bio-data', 'biodata', 'internship', 'certification',
  'certificate', 'achievement', 'reference', 'profile', 'responsibilit',
  'proficient', 'bachelor', 'master', 'diploma', 'university', 'college',
  'company', 'worked', 'developed', 'managed', 'expertise',
];

const MIN_WORDS = 12;              // below this, there isn't enough to be a résumé
const MIN_RESUME_HITS = 2;         // need at least this many résumé signals…
const LONG_DOC_WORDS = 300;        // …unless the document is long (then let AI judge)

/**
 * @param {string} text extracted document text
 * @returns {{ ok: boolean, category: string, reason?: string }}
 */
function validate(text) {
  const t = String(text || '').toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  const resumeHits = RESUME_SIGNALS.filter((s) => t.includes(s)).length;

  // Enough résumé sections → accept, even if short, and even if it also lists ID
  // details (Indian bio-data often does — that's still a valid résumé format).
  if (resumeHits >= MIN_RESUME_HITS) return { ok: true, category: 'resume' };

  // From here on there are almost no résumé signals.
  if (words < MIN_WORDS) {
    return { ok: false, category: 'too_short', reason: 'The uploaded file has too little readable text to be a résumé.' };
  }
  // ID markers WITHOUT any résumé sections → it's just an ID/official document.
  if (ID_DOC_SIGNALS.some((s) => t.includes(s))) {
    return { ok: false, category: 'id_document', reason: 'The uploaded file looks like an identity or official document, not a résumé/CV.' };
  }
  if (words < LONG_DOC_WORDS) {
    return { ok: false, category: 'not_resume', reason: "The uploaded file doesn't look like a résumé/CV — it's missing the usual sections such as experience, education, or skills." };
  }
  return { ok: true, category: 'resume' }; // long document with no clear markers — let AI decide
}

// --- Contact-details gate ---------------------------------------------------
// A candidate must be reachable. If the apply form gave no usable contact (a
// recruiter upload starts with a placeholder email) AND the résumé text has no
// email or phone either, the profile is rejected.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const digitsOf = (s) => String(s || '').replace(/\D/g, '');

// A real, reachable email already stored on the candidate (not the upload
// placeholder pending-*@pending.local).
const usableEmail = (e) => {
  const s = String(e || '').trim().toLowerCase();
  return Boolean(s) && !s.endsWith('@pending.local') && EMAIL_RE.test(s);
};
const usablePhone = (p) => digitsOf(p).length >= 8;

// Does the candidate ALREADY have a contact method (from the apply form)?
const hasUsableContact = (email, phone) => usableEmail(email) || usablePhone(phone);

// Does the free text contain an email or a phone-shaped number (8–15 digits)?
const hasContactInfo = (text) => {
  const t = String(text || '');
  if (EMAIL_RE.test(t)) return true;
  const runs = t.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  return runs.some((m) => { const d = digitsOf(m); return d.length >= 8 && d.length <= 15; });
};

module.exports = {
  validate, hasUsableContact, hasContactInfo,
  ID_DOC_SIGNALS, RESUME_SIGNALS,
};
