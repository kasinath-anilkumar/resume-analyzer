const SettingsRepo = require('../models/settingsRepo');
const AIService = require('../services/aiService');
const AuditRepo = require('../models/auditRepo');

// Mask a secret to a short hint, never revealing more than the last 4 chars.
const mask = (s) => (s ? `${'•'.repeat(Math.max(0, String(s).length - 4))}${String(s).slice(-4)}` : '');

// Build a client-safe view of settings. The raw API key is NEVER returned —
// only a masked hint. AI-related config (provider, model, key status) is
// exposed ONLY to Admins; everyone else gets just the general config they need
// (departments, locations, minAiScore) to use the app.
const sanitizeSettings = (settings, isAdmin) => {
  const general = {
    _id: settings._id,
    departments: settings.departments || [],
    locations: settings.locations || [],
    minAiScore: settings.minAiScore,
    updatedBy: settings.updatedBy,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
  if (!isAdmin) return general;

  const key = settings.aiApiKey || '';
  const metaToken = settings.metaAccessToken || '';
  const waToken = settings.whatsappAccessToken || '';
  return {
    ...general,
    aiProvider: settings.aiProvider || 'mock',
    aiModel: settings.aiModel || '',
    aiKeyConfigured: !!key,
    aiKeyMasked: mask(key),
    retentionDays: settings.retentionDays || 0,
    // Meta Lead Ads + WhatsApp — raw tokens NEVER leave the server, only status + masks.
    metaConfigured: !!(metaToken && settings.metaPageId),
    metaTokenMasked: mask(metaToken),
    metaPageId: settings.metaPageId || '',
    metaGraphVersion: settings.metaGraphVersion || 'v21.0',
    metaLastSyncedAt: settings.metaLastSyncedAt || null,
    whatsappConfigured: !!(waToken && settings.whatsappPhoneNumberId && settings.whatsappTemplateName),
    whatsappTokenMasked: mask(waToken),
    whatsappPhoneNumberId: settings.whatsappPhoneNumberId || '',
    whatsappTemplateName: settings.whatsappTemplateName || '',
  };
};

// @desc    Get global configurations
// @route   GET /api/settings
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    const settings = await SettingsRepo.get();
    return res.json({ success: true, data: sanitizeSettings(settings, req.user.role === 'Admin') });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving configurations' });
  }
};

// @desc    List the models the configured (or supplied) key can use
// @route   GET /api/settings/models
// @access  Private (Admin, Recruiter)
exports.getModels = async (req, res) => {
  try {
    const settings = await SettingsRepo.get();
    const apiKey = settings.aiApiKey;
    const provider = settings.aiProvider;
    if (!apiKey || !provider || provider === 'mock') {
      return res.json({ success: true, data: { provider, models: [], selected: settings.aiModel || '' } });
    }
    let models = [];
    try {
      models = await AIService.listModels(apiKey, provider);
    } catch (err) {
      console.error('List models failed:', err.message);
      return res.status(err.status || 502).json({
        success: false,
        code: err.code || 'AI_FAILED',
        message: err.message || 'Could not list models for the configured key.',
      });
    }
    return res.json({
      success: true,
      data: { provider, models, selected: settings.aiModel || AIService.defaultModel(provider) },
    });
  } catch (error) {
    console.error('Get models error:', error);
    return res.status(500).json({ success: false, message: 'Server error listing models' });
  }
};

// @desc    Preview the models a pasted key can use, WITHOUT saving it
// @route   POST /api/settings/models/preview
// @access  Private (Admin, Recruiter)
exports.previewModels = async (req, res) => {
  try {
    const key = AIService.cleanKey(req.body.aiApiKey);
    if (!key) {
      return res.status(400).json({ success: false, message: 'Provide an API key to preview.' });
    }
    const provider = AIService.detectProvider(key);
    if (!provider) {
      return res.status(400).json({ success: false, code: 'AI_KEY_FORMAT', message: 'Unrecognized API key format.' });
    }
    let models = [];
    try {
      models = await AIService.listModels(key, provider);
    } catch (err) {
      return res.status(err.status || 502).json({
        success: false,
        code: err.code || 'AI_FAILED',
        message: err.message || 'Could not list models for this key.',
      });
    }
    return res.json({ success: true, data: { provider, models } });
  } catch (error) {
    console.error('Preview models error:', error);
    return res.status(500).json({ success: false, message: 'Server error previewing models' });
  }
};

// @desc    Update global configurations
// @route   PUT /api/settings
// @access  Private (Admin, Recruiter)
exports.updateSettings = async (req, res) => {
  try {
    const {
      departments, locations, minAiScore, aiApiKey, aiModel, retentionDays,
      metaAccessToken, metaPageId, metaGraphVersion,
      whatsappAccessToken, whatsappPhoneNumberId, whatsappTemplateName,
    } = req.body;

    // Only an Admin may change the AI key/model, the data-retention policy, or the
    // Meta/WhatsApp integration credentials (all sensitive).
    const touchingMetaWa =
      typeof metaAccessToken === 'string' || metaPageId !== undefined || metaGraphVersion !== undefined ||
      typeof whatsappAccessToken === 'string' || whatsappPhoneNumberId !== undefined || whatsappTemplateName !== undefined;
    const touchingAdminOnly =
      typeof aiApiKey === 'string' || typeof aiModel === 'string' || retentionDays !== undefined || touchingMetaWa;
    if (touchingAdminOnly && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only an administrator can change the AI, retention, or Meta/WhatsApp integration settings.',
      });
    }

    // Resolve the AI key/provider only when the field is present in the body.
    //   - non-empty string -> validate the key is real & working, then store it
    //   - empty string     -> clear the key (analysis becomes unavailable)
    //   - undefined        -> leave the existing key untouched
    let aiUpdate = null;
    if (typeof aiApiKey === 'string') {
      // cleanKey strips wrapping quotes / zero-width chars that break detection.
      const trimmed = AIService.cleanKey(aiApiKey);
      if (trimmed) {
        const provider = AIService.detectProvider(trimmed);
        if (!provider) {
          return res.status(400).json({
            success: false,
            message: "Unrecognized API key format. Expected OpenAI (sk-...), Anthropic (sk-ant-...), NVIDIA NIM (nvapi-...), or Google Gemini (AIza...).",
          });
        }
        // Reject the key unless it actually authenticates with the provider.
        try {
          await AIService.validateKey(trimmed, provider);
        } catch (verifyErr) {
          return res.status(verifyErr.status || 400).json({
            success: false,
            code: verifyErr.code || 'AI_KEY_INVALID',
            message: verifyErr.message || 'Could not verify the API key with its provider.',
          });
        }
        aiUpdate = { aiApiKey: trimmed, aiProvider: provider };
      } else {
        aiUpdate = { aiApiKey: '', aiProvider: 'mock' };
      }
    }

    const patch = {};
    if (departments !== undefined) patch.departments = departments;
    if (locations !== undefined) patch.locations = locations;
    if (minAiScore !== undefined) patch.minAiScore = minAiScore;
    if (retentionDays !== undefined) patch.retentionDays = retentionDays;
    if (aiUpdate) {
      patch.aiApiKey = aiUpdate.aiApiKey;
      patch.aiProvider = aiUpdate.aiProvider;
      // A new/cleared key means the previously selected model may not apply —
      // reset it so analysis uses the provider default until one is picked.
      patch.aiModel = '';
    }
    // Allow explicitly setting the model (e.g. from the model picker).
    if (typeof aiModel === 'string') patch.aiModel = aiModel.trim();

    // Meta Lead Ads + WhatsApp credentials/config. Tokens: a string sets/clears,
    // undefined leaves untouched (same semantics as the AI key). Not validated on
    // save — the Settings "Test connection" endpoint verifies them separately so
    // saving stays a single fast write (no extra external call on the save path).
    if (typeof metaAccessToken === 'string') patch.metaAccessToken = AIService.cleanKey(metaAccessToken);
    if (metaPageId !== undefined) patch.metaPageId = metaPageId;
    if (metaGraphVersion !== undefined) patch.metaGraphVersion = metaGraphVersion;
    if (typeof whatsappAccessToken === 'string') patch.whatsappAccessToken = AIService.cleanKey(whatsappAccessToken);
    if (whatsappPhoneNumberId !== undefined) patch.whatsappPhoneNumberId = whatsappPhoneNumberId;
    if (whatsappTemplateName !== undefined) patch.whatsappTemplateName = whatsappTemplateName;

    const settings = await SettingsRepo.update(patch, req.user.id);

    // Audit the change, calling out the sensitive fields explicitly.
    const changed = [];
    if (aiUpdate) changed.push(aiUpdate.aiApiKey ? `AI key (→ ${aiUpdate.aiProvider})` : 'AI key cleared');
    if (typeof aiModel === 'string') changed.push(`AI model → ${aiModel || 'default'}`);
    if (retentionDays !== undefined) changed.push(`retention → ${Number(retentionDays) || 0} days`);
    if (departments !== undefined) changed.push('departments');
    if (locations !== undefined) changed.push('locations');
    if (minAiScore !== undefined) changed.push('min AI score');
    if (typeof metaAccessToken === 'string') changed.push(patch.metaAccessToken ? 'Meta token' : 'Meta token cleared');
    if (metaPageId !== undefined) changed.push('Meta page id');
    if (typeof whatsappAccessToken === 'string') changed.push(patch.whatsappAccessToken ? 'WhatsApp token' : 'WhatsApp token cleared');
    if (whatsappPhoneNumberId !== undefined) changed.push('WhatsApp phone id');
    if (whatsappTemplateName !== undefined) changed.push('WhatsApp template');
    if (changed.length) {
      AuditRepo.log(req.user, 'settings.update', { entityType: 'settings', entityId: 'settings', summary: `Updated settings: ${changed.join(', ')}`, meta: { changed } });
    }

    // Note: we intentionally do NOT fetch the model list here. Saving already
    // makes one external call (validateKey); a second call (listModels) added
    // latency and a failure/timeout point on small hosts (observed as 502s on
    // Render free tier). The UI populates the picker via the preview endpoint
    // when the key is entered, and via GET /settings/models on load.
    return res.json({ success: true, data: sanitizeSettings(settings, req.user.role === 'Admin') });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating configurations' });
  }
};
