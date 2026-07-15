const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Resume file storage.
 *
 * Primary target: Supabase Storage (via its REST API — no SDK dependency).
 * Fallback: local disk under backend/uploads (used automatically when the
 * Supabase environment variables are not configured), so the app keeps
 * working out of the box.
 *
 * Required env for Supabase:
 *   SUPABASE_URL                 e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    service_role key (server-side only!)
 *   SUPABASE_BUCKET              bucket name (default: "resumes")
 *
 * SECURITY: keep the bucket PRIVATE. Résumés are PII; the app never hands out a
 * permanent public URL — it serves downloads through authenticated endpoints
 * that mint a short-lived signed URL (getSignedUrl below). See OPERATIONS.md.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'resumes';

// Hard cap on a résumé download (defense against a giant-response memory blow-up).
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;

const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

// Unguessable object name (crypto UUID, not Math.random) so a stored file can't
// be enumerated even if the bucket were ever misconfigured as public.
const buildFileName = (originalName) => {
  const ext = (path.extname(originalName || '') || '').toLowerCase();
  return `resume-${crypto.randomUUID()}${ext}`;
};

const uploadsDir = () => path.resolve(__dirname, '../uploads');

// True only for a URL that points at OUR OWN Supabase Storage object endpoint.
// Used to gate server-side fetches so a caller-influenced URL can never make the
// server request an arbitrary/internal host (SSRF).
const isOwnStorageUrl = (u) => {
  if (!SUPABASE_URL) return false;
  try {
    const a = new URL(u);
    const b = new URL(SUPABASE_URL);
    return a.origin === b.origin && a.pathname.includes('/storage/v1/object/');
  } catch (_) {
    return false;
  }
};

// Extract "<bucket>/<objectPath>" from a stored Supabase public/sign URL.
const objectKeyFromUrl = (url) => {
  for (const marker of ['/storage/v1/object/public/', '/storage/v1/object/sign/', '/storage/v1/object/']) {
    const idx = url.indexOf(marker);
    if (idx !== -1) return url.slice(idx + marker.length).split('?')[0];
  }
  return null;
};

const uploadToSupabase = async (buffer, fileName, mimeType) => {
  const objectPath = encodeURIComponent(fileName);
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`;

  await axios.post(uploadUrl, buffer, {
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': mimeType || 'application/octet-stream',
      'x-upsert': 'true',
      'Cache-Control': 'max-age=3600',
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  // Store the canonical object path. NOTE: this is the object's public-style path
  // for compatibility with existing rows, but access is via signed URLs — keep
  // the bucket private (OPERATIONS.md) so this path is not directly browsable.
  const url = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;

  return {
    url,
    storagePath: `${SUPABASE_BUCKET}/${fileName}`,
    provider: 'supabase',
  };
};

const uploadToLocal = (buffer, fileName) => {
  const uploadDir = uploadsDir();
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const dest = path.join(uploadDir, fileName);
  fs.writeFileSync(dest, buffer);
  return {
    url: `/uploads/${fileName}`,
    storagePath: dest,
    provider: 'local',
  };
};

class StorageService {
  static isSupabaseConfigured() {
    return isSupabaseConfigured();
  }

  /**
   * Persist a resume buffer and return a URL reference.
   * @returns {Promise<{url: string, storagePath: string, provider: 'supabase'|'local'}>}
   */
  static async uploadResume(buffer, originalName, mimeType) {
    const fileName = buildFileName(originalName);
    if (isSupabaseConfigured()) {
      return uploadToSupabase(buffer, fileName, mimeType);
    }
    return uploadToLocal(buffer, fileName);
  }

  /**
   * Mint a short-lived signed URL for viewing/downloading a stored résumé. This
   * is the ONLY way a résumé is exposed to a client — always behind an
   * authenticated, ownership-checked endpoint. Local-disk fallback returns the
   * /uploads path unchanged (dev only). Returns null on failure.
   */
  static async getSignedUrl(resumeUrl, expiresIn = 60) {
    if (!resumeUrl) return null;
    if (resumeUrl.startsWith('/uploads/')) return resumeUrl; // local dev fallback
    if (!isSupabaseConfigured()) return resumeUrl;
    const key = objectKeyFromUrl(resumeUrl);
    if (!key) return resumeUrl;
    try {
      const signUrl = `${SUPABASE_URL}/storage/v1/object/sign/${key}`;
      const res = await axios.post(
        signUrl,
        { expiresIn },
        { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const signed = res.data && (res.data.signedURL || res.data.signedUrl);
      return signed ? `${SUPABASE_URL}/storage/v1${signed}` : null;
    } catch (err) {
      console.error('Signed URL creation failed:', err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Download a previously stored resume back into memory so it can be re-parsed
   * (e.g. re-running AI analysis). SSRF-safe: an http(s) URL is fetched ONLY when
   * it points at our own Supabase Storage origin — never an arbitrary/internal
   * host — and the response size is capped. Returns { buffer, mimeType, originalName }.
   */
  static async downloadResume(resumeUrl) {
    if (!resumeUrl) throw new Error('No resume URL to download');
    const originalName = decodeURIComponent(resumeUrl.split('/').pop().split('?')[0]) || 'resume';

    if (/^https?:\/\//i.test(resumeUrl)) {
      if (!isOwnStorageUrl(resumeUrl)) {
        // Refuse to fetch anything that isn't our own storage (SSRF guard).
        throw new Error('Refusing to fetch a résumé from an untrusted URL');
      }
      const res = await axios.get(resumeUrl, {
        responseType: 'arraybuffer',
        maxContentLength: MAX_DOWNLOAD_BYTES,
        maxBodyLength: MAX_DOWNLOAD_BYTES,
        // Authenticate so this keeps working once the bucket is private.
        headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      return {
        buffer: Buffer.from(res.data),
        mimeType: res.headers['content-type'] || 'application/octet-stream',
        originalName,
      };
    }

    // Local disk fallback: /uploads/<file>. Resolve and contain the path so a
    // "../.." in the stored value can't escape the uploads directory.
    if (resumeUrl.startsWith('/uploads/')) {
      const dir = uploadsDir();
      const dest = path.resolve(dir, resumeUrl.replace('/uploads/', ''));
      if (dest !== dir && !dest.startsWith(dir + path.sep)) {
        throw new Error('Invalid resume path');
      }
      const buffer = fs.readFileSync(dest);
      return { buffer, mimeType: 'application/octet-stream', originalName };
    }

    throw new Error('Unsupported resume URL for download');
  }

  /**
   * Best-effort removal of a stored resume file so no orphaned data is left
   * behind when a candidate is deleted. Never throws — a failed storage delete
   * should not block the candidate record removal.
   * @param {string} resumeUrl The stored public URL / local path.
   * @returns {Promise<boolean>} whether a file was removed.
   */
  static async deleteResume(resumeUrl) {
    if (!resumeUrl) return false;
    try {
      // Supabase URL: .../storage/v1/object/public/<bucket>/<file>
      const marker = '/storage/v1/object/public/';
      const idx = resumeUrl.indexOf(marker);
      if (idx !== -1 && isSupabaseConfigured()) {
        const bucketAndPath = resumeUrl.slice(idx + marker.length); // e.g. resumes/resume-uuid.pdf
        const delUrl = `${SUPABASE_URL}/storage/v1/object/${bucketAndPath}`;
        await axios.delete(delUrl, {
          headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        return true;
      }

      // Local disk fallback: /uploads/<file>
      if (resumeUrl.startsWith('/uploads/')) {
        const dir = uploadsDir();
        const dest = path.resolve(dir, resumeUrl.replace('/uploads/', ''));
        if ((dest === dir || dest.startsWith(dir + path.sep)) && fs.existsSync(dest)) {
          fs.unlinkSync(dest);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Resume deletion failed:', err.response?.data || err.message);
      return false;
    }
  }
}

module.exports = StorageService;
