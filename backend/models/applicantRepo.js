const bcrypt = require('bcryptjs');
const { getClient } = require('../config/supabase');

// Careers-portal accounts (candidate-facing). Mirrors userRepo but for the
// SEPARATE `applicants` identity space — an applicant is never a recruiter.
const TABLE = 'applicants';

// Client-safe shape — never includes the password hash or reset token.
const toApi = (row) =>
  row && {
    _id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    linkedinUrl: row.linkedin_url || '',
    portfolioUrl: row.portfolio_url || '',
    bio: row.bio || '',
    resumeUrl: row.resume_url || '',
    location: row.location || '',
    createdAt: row.created_at,
  };

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const sha256Cols = { hash: 'reset_token_hash', exp: 'reset_token_expires' };

const ApplicantRepo = {
  toApi,
  normalizeEmail,

  // Raw row INCLUDING the password hash — for login only.
  async findRawByEmail(email) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .eq('email', normalizeEmail(email))
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async findById(id) {
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return toApi(data);
  },

  // Admin/recruiter listing of everyone registered on the careers portal.
  async listAll() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, name, email, phone, location, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({
      _id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone || '',
      location: r.location || '',
      createdAt: r.created_at,
    }));
  },

  async existsByEmail(email) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id')
      .eq('email', normalizeEmail(email))
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async create({ name, email, password, phone }) {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    const { data, error } = await getClient()
      .from(TABLE)
      .insert({ name, email: normalizeEmail(email), password: hashed, phone: phone || null })
      .select('*')
      .single();
    if (error) throw error;
    return toApi(data);
  },

  // Delete the account by id (account-only). Applications keep their rows —
  // candidates.applicant_id is set null by the FK. Returns email + resume_url.
  async deleteById(id) {
    const { data, error } = await getClient()
      .from(TABLE)
      .delete()
      .eq('id', id)
      .select('id, email, resume_url');
    if (error) throw error;
    return data && data.length ? { _id: data[0].id, email: data[0].email, resumeUrl: data[0].resume_url } : null;
  },

  async findRawById(id) {
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  },

  // GDPR: delete the portal account for an email. Returns the removed account's
  // saved primary résumé URL (if any) for storage cleanup, or null if no account.
  async deleteByEmail(email) {
    const e = normalizeEmail(email);
    if (!e) return null;
    const { data, error } = await getClient()
      .from(TABLE)
      .delete()
      .eq('email', e)
      .select('id, resume_url');
    if (error) throw error;
    return data && data.length ? { _id: data[0].id, resumeUrl: data[0].resume_url } : null;
  },

  async matchPassword(plain, rawRow) {
    if (!rawRow || !rawRow.password) return false;
    return bcrypt.compare(plain, rawRow.password);
  },

  // Update self-service profile fields. Only defined keys are written.
  async updateProfile(id, data = {}) {
    const row = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) row.name = String(data.name).trim();
    if (data.phone !== undefined) row.phone = data.phone;
    if (data.linkedinUrl !== undefined) row.linkedin_url = data.linkedinUrl;
    if (data.portfolioUrl !== undefined) row.portfolio_url = data.portfolioUrl;
    if (data.bio !== undefined) row.bio = data.bio;
    if (data.resumeUrl !== undefined) row.resume_url = data.resumeUrl;
    if (data.location !== undefined) row.location = data.location;
    const { data: updated, error } = await getClient()
      .from(TABLE).update(row).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    return toApi(updated);
  },

  async updateResume(id, resumeUrl) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ resume_url: resumeUrl, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    return toApi(data);
  },

  // --- Password reset (same pattern as userRepo) -------------------------
  async setResetToken(id, tokenHash, expiresIso) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ [sha256Cols.hash]: tokenHash, [sha256Cols.exp]: expiresIso, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async findByResetTokenHash(tokenHash) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .eq(sha256Cols.hash, tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (!data.reset_token_expires || new Date(data.reset_token_expires) < new Date()) return null;
    return data;
  },

  async updatePassword(id, newPlainPassword) {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPlainPassword, salt);
    const { error } = await getClient()
      .from(TABLE)
      .update({
        password: hashed,
        [sha256Cols.hash]: null,
        [sha256Cols.exp]: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    return true;
  },
};

module.exports = ApplicantRepo;
