const bcrypt = require('bcryptjs');
const { getClient } = require('../config/supabase');

const TABLE = 'users';

// Map a DB row to the client-safe API shape (never includes the password hash).
const toApi = (row) =>
  row && {
    _id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
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
    const salt = await bcrypt.genSalt(10);
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
};

module.exports = UserRepo;
