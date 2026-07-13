const axios = require('axios');
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
 * The bucket should be created as PUBLIC so the stored public URL is browsable.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'resumes';

const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

const buildFileName = (originalName) => {
  const ext = (path.extname(originalName || '') || '').toLowerCase();
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `resume-${unique}${ext}`;
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

  // Public URL (requires the bucket to be public).
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;

  return {
    url: publicUrl,
    storagePath: `${SUPABASE_BUCKET}/${fileName}`,
    provider: 'supabase',
  };
};

const uploadToLocal = (buffer, fileName) => {
  const uploadDir = path.join(__dirname, '../uploads');
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
   * Persist a resume buffer and return a browsable URL.
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
   * Download a previously stored resume back into memory so it can be
   * re-parsed (e.g. for re-running AI analysis). Works for both Supabase public
   * URLs and the local-disk fallback. Returns { buffer, mimeType, originalName }.
   */
  static async downloadResume(resumeUrl) {
    if (!resumeUrl) throw new Error('No resume URL to download');
    const originalName = decodeURIComponent(resumeUrl.split('/').pop().split('?')[0]) || 'resume';

    if (/^https?:\/\//i.test(resumeUrl)) {
      const res = await axios.get(resumeUrl, { responseType: 'arraybuffer', maxContentLength: Infinity });
      return {
        buffer: Buffer.from(res.data),
        mimeType: res.headers['content-type'] || 'application/octet-stream',
        originalName,
      };
    }

    // Local disk fallback: /uploads/<file>
    if (resumeUrl.startsWith('/uploads/')) {
      const dest = path.join(__dirname, '../uploads', resumeUrl.replace('/uploads/', ''));
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
      // Supabase public URL: .../storage/v1/object/public/<bucket>/<file>
      const marker = '/storage/v1/object/public/';
      const idx = resumeUrl.indexOf(marker);
      if (idx !== -1 && isSupabaseConfigured()) {
        const bucketAndPath = resumeUrl.slice(idx + marker.length); // e.g. resume/resume-123.pdf
        const delUrl = `${SUPABASE_URL}/storage/v1/object/${bucketAndPath}`;
        await axios.delete(delUrl, {
          headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        return true;
      }

      // Local disk fallback: /uploads/<file>
      if (resumeUrl.startsWith('/uploads/')) {
        const fileName = resumeUrl.replace('/uploads/', '');
        const dest = path.join(__dirname, '../uploads', fileName);
        if (fs.existsSync(dest)) {
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
