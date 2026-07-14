const { getClient } = require('../config/supabase');

const TABLE = 'audit_log';

const toApi = (row) =>
  row && {
    _id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    meta: row.meta || {},
    createdAt: row.created_at,
  };

const AuditRepo = {
  toApi,

  // Fire-and-forget audit write. NEVER throws into the caller — an audit failure
  // must not break the primary request. Call WITHOUT await from controllers.
  async log(actor, action, { entityType, entityId, summary, meta } = {}) {
    try {
      await getClient().from(TABLE).insert({
        actor_id: actor?.id || actor?._id || null,
        actor_name: actor?.name || 'System',
        actor_role: actor?.role || null,
        action,
        entity_type: entityType || null,
        entity_id: entityId != null ? String(entityId) : null,
        summary: summary || null,
        meta: meta || {},
      });
    } catch (err) {
      console.error('Audit log write failed:', err.message);
    }
  },

  // Paginated, filterable list (newest first).
  async list({ actorId, action, entityType, page = 1, limit = 50 } = {}) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const pg = Math.max(parseInt(page, 10) || 1, 1);
    const from = (pg - 1) * lim;

    let q = getClient().from(TABLE).select('*', { count: 'exact' });
    if (actorId) q = q.eq('actor_id', actorId);
    if (action) q = q.eq('action', action);
    if (entityType) q = q.eq('entity_type', entityType);
    q = q.order('created_at', { ascending: false }).range(from, from + lim - 1);

    const { data, error, count } = await q;
    if (error) throw error;
    return { data: (data || []).map(toApi), total: count || 0, page: pg, limit: lim };
  },
};

module.exports = AuditRepo;
