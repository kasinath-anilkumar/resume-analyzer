const SettingsRepo = require('../models/settingsRepo');
const AIService = require('../services/aiService');

// Build a client-safe view of settings: never expose the raw API key, only a
// masked hint (last 4 chars), whether one is configured, and the provider.
const sanitizeSettings = (settings) => {
  const obj = { ...settings };
  const key = obj.aiApiKey || '';
  delete obj.aiApiKey;
  return {
    ...obj,
    aiProvider: obj.aiProvider || 'mock',
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
    return res.json({ success: true, data: sanitizeSettings(settings) });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving configurations' });
  }
};

// @desc    Update global configurations
// @route   PUT /api/settings
// @access  Private (Admin, Recruiter)
exports.updateSettings = async (req, res) => {
  try {
    const { departments, locations, minAiScore, aiApiKey } = req.body;

    // Resolve the AI key/provider only when the field is present in the body.
    //   - non-empty string -> validate the key is real & working, then store it
    //   - empty string     -> clear the key (analysis becomes unavailable)
    //   - undefined        -> leave the existing key untouched
    let aiUpdate = null;
    if (typeof aiApiKey === 'string') {
      const trimmed = aiApiKey.trim();
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
    }

    const settings = await SettingsRepo.update(patch, req.user.id);
    return res.json({ success: true, data: sanitizeSettings(settings) });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating configurations' });
  }
};
