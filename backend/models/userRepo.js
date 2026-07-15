const bcrypt = require('bcryptjs');
const { getClient } = require('../config/supabase');

const TABLE = 'users';
const BCRYPT_COST = 12; // work factor for password hashing

// Map a DB row to the client-safe API shape (never includes the password hash).
const toApi = (row) =>
  row && {
    _id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordChangedAt: row.password_changed_at || null, // used for session revocation
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const UserRepo = {
  toApi,

  // Returns the raw row INCLUDING the password hash — for login only.
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
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();
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

  async create({ name, email, password, role }) {
    const salt = await bcrypt.genSalt(BCRYPT_COST);
    const hashed = await bcrypt.hash(password, salt);
    const { data, error } = await getClient()
      .from(TABLE)
      .insert({ name, email: normalizeEmail(email), password: hashed, role })
      .select('*')
      .single();
    if (error) throw error;
    return toApi(data);
  },

  async list() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toApi);
  },

  async updateRole(id, role) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return toApi(data);
  },

  async remove(id) {
    const { error } = await getClient().from(TABLE).delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async count() {
    const { count, error } = await getClient()
      .from(TABLE)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },

  async countByRole(role) {
    const { count, error } = await getClient()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('role', role);
    if (error) throw error;
    return count || 0;
  },

  // Verify a plaintext password against a raw row's hash.
  async matchPassword(plain, rawRow) {
    if (!rawRow || !rawRow.password) return false;
    return bcrypt.compare(plain, rawRow.password);
  },

  // --- Password reset ---------------------------------------------------
  async setResetToken(id, tokenHash, expiresIso) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ reset_token_hash: tokenHash, reset_token_expires: expiresIso, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Find a user by a (hashed) reset token that hasn't expired. Returns the raw
  // row or null.
  async findByResetTokenHash(tokenHash) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .eq('reset_token_hash', tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (!data.reset_token_expires || new Date(data.reset_token_expires) < new Date()) return null;
    return data;
  },

  // Set a new password (hashed) and clear any reset token. Stamps
  // password_changed_at so sessions issued before now are revoked.
  async updatePassword(id, newPlainPassword) {
    const salt = await bcrypt.genSalt(BCRYPT_COST);
    const hashed = await bcrypt.hash(newPlainPassword, salt);
    const now = new Date().toISOString();
    const { error } = await getClient()
      .from(TABLE)
      .update({
        password: hashed,
        reset_token_hash: null,
        reset_token_expires: null,
        password_changed_at: now,
        updated_at: now,
      })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Raw row (incl. password hash) by id — for verifying the current password
  // on a self-service change.
  async findRawById(id) {
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  },
};

module.exports = UserRepo;
