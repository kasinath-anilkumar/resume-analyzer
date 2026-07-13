const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getModels, previewModels } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getSettings)
  .put(protect, authorize('Admin', 'Recruiter'), updateSettings);

// AI model listing/preview — Admin only (the AI key is admin-managed).
router.get('/models', protect, authorize('Admin'), getModels);
router.post('/models/preview', protect, authorize('Admin'), previewModels);

module.exports = router;
