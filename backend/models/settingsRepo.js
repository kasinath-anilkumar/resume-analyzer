const { getClient } = require('../config/supabase');
const { encrypt, decrypt } = require('../utils/secretCrypto');

const TABLE = 'settings';
const ROW_ID = 1; // single-row table

const DEFAULT_DEPARTMENTS = [
  'Frontend Engineering',
  'Backend Architecture',
  'UI/UX Design',
  'Product Management',
  'Sales',
  'Marketing',
  'Human Resources',
];
const DEFAULT_LOCATIONS = [
  'Remote',
  'Hybrid (New York, NY)',
  'San Francisco, CA',
  'Bangalore, India',
  'London, UK',
];

// API shape mirrors the old Mongoose document (incl. the raw aiApiKey — the
// controller is responsible for masking it before returning to clients).
const toApi = (row) =>
  row && {
    _id: row.id,
    departments: row.departments || [],
    locations: row.locations || [],
    minAiScore: row.min_ai_score,
    aiProvider: row.ai_provider || 'mock',
    aiApiKey: decrypt(row.ai_api_key), // stored encrypted at rest
    aiModel: row.ai_model || '',
    retentionDays: row.retention_days || 0,
    // Meta Lead Ads + WhatsApp (tokens decrypted here; controller masks them)
    metaAccessToken: decrypt(row.meta_access_token),
    metaPageId: row.meta_page_id || '',
    metaGraphVersion: row.meta_graph_version || 'v21.0',
    metaLastSyncedAt: row.meta_last_synced_at || null,
    whatsappAccessToken: decrypt(row.whatsapp_access_token),
    whatsappPhoneNumberId: row.whatsapp_phone_number_id || '',
    whatsappTemplateName: row.whatsapp_template_name || '',
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

const SettingsRepo = {
  toApi,

  // Get the singleton settings row, seeding defaults on first access.
  async get() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .eq('id', ROW_ID)
      .maybeSingle();
    if (error) throw error;
    if (data) return toApi(data);

    const { data: seeded, error: seedErr } = await getClient()
      .from(TABLE)
      .insert({
        id: ROW_ID,
        departments: DEFAULT_DEPARTMENTS,
        locations: DEFAULT_LOCATIONS,
        min_ai_score: 60,
        ai_provider: 'mock',
        ai_api_key: '',
      })
      .select('*')
      .single();
    if (seedErr) throw seedErr;
    return toApi(seeded);
  },

  // Apply a partial patch (only defined fields) and return the updated row.
  async update(patch = {}, userId) {
    await this.get(); // ensure the row exists

    const row = { updated_at: new Date().toISOString() };
    if (patch.departments !== undefined) row.departments = patch.departments;
    if (patch.locations !== undefined) row.locations = patch.locations;
    if (patch.minAiScore !== undefined && patch.minAiScore !== null && patch.minAiScore !== '') {
      row.min_ai_score = Number(patch.minAiScore);
    }
    if (patch.aiProvider !== undefined) row.ai_provider = patch.aiProvider;
    if (patch.aiApiKey !== undefined) row.ai_api_key = encrypt(patch.aiApiKey);
    if (patch.aiModel !== undefined) row.ai_model = patch.aiModel;
    if (patch.retentionDays !== undefined) {
      const n = parseInt(patch.retentionDays, 10);
      row.retention_days = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    // Meta Lead Ads + WhatsApp (tokens encrypted at rest).
    if (patch.metaAccessToken !== undefined) row.meta_access_token = encrypt(patch.metaAccessToken);
    if (patch.metaPageId !== undefined) row.meta_page_id = String(patch.metaPageId || '').trim();
    if (patch.metaGraphVersion !== undefined) row.meta_graph_version = String(patch.metaGraphVersion || '').trim() || 'v21.0';
    if (patch.metaLastSyncedAt !== undefined) row.meta_last_synced_at = patch.metaLastSyncedAt;
    if (patch.whatsappAccessToken !== undefined) row.whatsapp_access_token = encrypt(patch.whatsappAccessToken);
    if (patch.whatsappPhoneNumberId !== undefined) row.whatsapp_phone_number_id = String(patch.whatsappPhoneNumberId || '').trim();
    if (patch.whatsappTemplateName !== undefined) row.whatsapp_template_name = String(patch.whatsappTemplateName || '').trim();
    if (userId) row.updated_by = userId;

    const { data, error } = await getClient()
      .from(TABLE)
      .update(row)
      .eq('id', ROW_ID)
      .select('*')
      .single();
    if (error) throw error;
    return toApi(data);
  },
};

module.exports = SettingsRepo;
