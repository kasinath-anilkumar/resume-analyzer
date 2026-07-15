const express = require('express');
const router = express.Router();
const { getAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

// Read-only recruiter analytics. Any authenticated staff role may view.
router.get('/', protect, getAnalytics);

module.exports = router;
