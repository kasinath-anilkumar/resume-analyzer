const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getSettings)
  .put(protect, authorize('Admin', 'Recruiter'), updateSettings);

module.exports = router;
