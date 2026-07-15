const express = require('express');
const router = express.Router();
const { listJobs, getJob, apply, getLeadByToken, submitLeadResume } = require('../controllers/publicController');
const upload = require('../middleware/upload');
const { applyLimiter, applyBurstLimiter, publicReadLimiter } = require('../middleware/rateLimit');
const { attachApplicant } = require('../middleware/auth');

// Public careers endpoints — NO auth. Only active jobs are exposed, and the
// apply endpoint is rate-limited to curb spam.
router.get('/jobs', publicReadLimiter, listJobs);
router.get('/jobs/:id', publicReadLimiter, getJob);
// attachApplicant soft-decodes an applicant token (if present) so logged-in
// applicants can reuse their saved résumé and link the application to their account.
router.post('/apply', applyBurstLimiter, applyLimiter, attachApplicant, upload.single('resume'), upload.validateResumeContent, apply);

// Meta-lead résumé upload (the personal WhatsApp link). Token is the credential.
router.get('/lead/:token', publicReadLimiter, getLeadByToken);
router.post('/lead/:token/resume', applyBurstLimiter, applyLimiter, upload.single('resume'), upload.validateResumeContent, submitLeadResume);

module.exports = router;
