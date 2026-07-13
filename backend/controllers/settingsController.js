const SettingsRepo = require('../models/settingsRepo');
const AIService = require('../services/aiService');

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
  return {
    ...general,
    aiProvider: settings.aiProvider || 'mock',
    aiModel: settings.aiModel || '',
    aiKeyConfigured: !!key,
    aiKeyMasked: key ? `${'•'.repeat(Math.max(0, key.length - 4))}${key.slice(-4)}` : '',
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
    const { departments, locations, minAiScore, aiApiKey, aiModel } = req.body;

    // Only an Admin may add/change/clear the AI provider key or model.
    const touchingAi = typeof aiApiKey === 'string' || typeof aiModel === 'string';
    if (touchingAi && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only an administrator can change the AI provider key or model.',
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
    if (aiUpdate) {
      patch.aiApiKey = aiUpdate.aiApiKey;
      patch.aiProvider = aiUpdate.aiProvider;
      // A new/cleared key means the previously selected model may not apply —
      // reset it so analysis uses the provider default until one is picked.
      patch.aiModel = '';
    }
    // Allow explicitly setting the model (e.g. from the model picker).
    if (typeof aiModel === 'string') patch.aiModel = aiModel.trim();

    const settings = await SettingsRepo.update(patch, req.user.id);

    // When a working key was just set, fetch the models it can use so the UI can
    // immediately offer a picker.
    let availableModels;
    if (aiUpdate && aiUpdate.aiApiKey) {
      try {
        availableModels = await AIService.listModels(aiUpdate.aiApiKey, aiUpdate.aiProvider);
      } catch (err) {
        console.error('List models after save failed:', err.message);
        availableModels = [];
      }
    }

    return res.json({ success: true, data: sanitizeSettings(settings, req.user.role === 'Admin'), availableModels });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating configurations' });
  }
};
