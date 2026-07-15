const { getClient } = require('../config/supabase');

const TABLE = 'notifications';

const toApi = (row, userId) => {
  if (!row) return row;
  const readBy = row.read_by || [];
  const api = {
    _id: row.id,
    title: row.title || '',
    message: row.message,
    sender: row.sender,
    senderName: row.sender_name || 'Admin',
    targetType: row.target_type,
    targetRole: row.target_role,
    targetUser: row.target_user,
    readBy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (userId !== undefined) {
    api.read = readBy.some((x) => String(x) === String(userId));
  }
  return api;
};

// PostgREST filter matching notifications visible to a user. role/id come from
// the verified JWT (not free-form input), but we still validate them against the
// known shapes before interpolating into the .or() filter, so a future code path
// that let either be influenced can't break out of the filter syntax.
const ROLES = new Set(['Admin', 'Recruiter', 'Hiring Manager']);
const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const visibleOr = (user) => {
  const clauses = ['target_type.eq.all'];
  if (ROLES.has(user.role)) clauses.push(`and(target_type.eq.role,target_role.eq.${user.role})`);
  if (UUID_RE.test(String(user.id || ''))) clauses.push(`and(target_type.eq.user,target_user.eq.${user.id})`);
  return clauses.join(',');
};

const NotificationRepo = {
  toApi,

  async create(base) {
    const row = {
      title: base.title || '',
      message: base.message,
      sender: base.sender || null,
      sender_name: base.senderName || 'Admin',
      target_type: base.targetType,
      target_role: base.targetRole || null,
      target_user: base.targetUser || null,
    };
    const { data, error } = await getClient().from(TABLE).insert(row).select('*').single();
    if (error) throw error;
    return toApi(data);
  },

  async getForUser(user) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .or(visibleOr(user))
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map((r) => toApi(r, user.id));
  },

  async markRead(id, userId) {
    const { data, error } = await getClient().from(TABLE).select('read_by').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return false;
    const readBy = data.read_by || [];
    if (readBy.some((x) => String(x) === String(userId))) return true;
    const { error: upErr } = await getClient()
      .from(TABLE)
      .update({ read_by: [...readBy, userId] })
      .eq('id', id);
    if (upErr) throw upErr;
    return true;
  },

  async markAllRead(user) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, read_by')
      .or(visibleOr(user));
    if (error) throw error;
    const updates = (data || [])
      .filter((r) => !(r.read_by || []).some((x) => String(x) === String(user.id)))
      .map((r) =>
        getClient()
          .from(TABLE)
          .update({ read_by: [...(r.read_by || []), user.id] })
          .eq('id', r.id)
      );
    await Promise.all(updates);
    return true;
  },

  // Admin "sent" view: newest 100, with targetUser populated to {_id,name,email}.
  async getAll() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data || []).map((r) => toApi(r));

    const userIds = [...new Set(rows.map((r) => r.targetUser).filter(Boolean).map(String))];
    if (userIds.length) {
      const { data: users, error: uErr } = await getClient()
        .from('users')
        .select('id, name, email')
        .in('id', userIds);
      if (uErr) throw uErr;
      const map = {};
      (users || []).forEach((u) => (map[u.id] = { _id: u.id, name: u.name, email: u.email }));
      rows.forEach((r) => {
        if (r.targetUser && map[String(r.targetUser)]) r.targetUser = map[String(r.targetUser)];
      });
    }
    return rows;
  },

  async remove(id) {
    const { error } = await getClient().from(TABLE).delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  // Resolve the email addresses a notification should reach based on its target.
  async resolveRecipientEmails({ targetType, targetRole, targetUser }) {
    let q = getClient().from('users').select('email');
    if (targetType === 'role') q = q.eq('role', targetRole);
    else if (targetType === 'user') q = q.eq('id', targetUser);
    // targetType 'all' → every user
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((u) => u.email).filter(Boolean);
  },
};

module.exports = NotificationRepo;
