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

  async matchPassword(plain, rawRow) {
    if (!rawRow || !rawRow.password) return false;
    return bcrypt.compare(plain, rawRow.password);
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
