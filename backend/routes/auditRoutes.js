const express = require('express');
const router = express.Router();
const { listAudit } = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/auth');

// Audit log — Admin only.
router.get('/', protect, authorize('Admin'), listAudit);

module.exports = router;
