const express = require('express');
const router = express.Router();
const { listJobs, getJob, apply } = require('../controllers/publicController');
const upload = require('../middleware/upload');
const { applyLimiter } = require('../middleware/rateLimit');

// Public careers endpoints — NO auth. Only active jobs are exposed, and the
// apply endpoint is rate-limited to curb spam.
router.get('/jobs', listJobs);
router.get('/jobs/:id', getJob);
router.post('/apply', applyLimiter, upload.single('resume'), apply);

module.exports = router;
