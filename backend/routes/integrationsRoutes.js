const express = require('express');
const router = express.Router();
const { testMeta, getMetaForms, mapMetaForm, syncNow, importLeads } = require('../controllers/integrationsController');
const { protect, authorize } = require('../middleware/auth');
const sheetUpload = require('../middleware/sheetUpload');

// Meta Lead Ads + WhatsApp integration management. Admin-only (touches credentials
// and pulls external applicant data).
router.post('/meta/test', protect, authorize('Admin'), testMeta);
router.get('/meta/forms', protect, authorize('Admin'), getMetaForms);
router.post('/meta/map', protect, authorize('Admin'), mapMetaForm);
router.post('/meta/sync', protect, authorize('Admin'), syncNow);

// Manual lead import from a CSV → same create-candidate + WhatsApp-request path.
router.post('/leads/import', protect, authorize('Admin'), sheetUpload.single('file'), importLeads);

module.exports = router;
