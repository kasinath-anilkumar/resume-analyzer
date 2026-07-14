const express = require('express');
const router = express.Router();
const {
  getJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  duplicateJob,
  closeJob,
  archiveJob,
  activateJob,
  extractJobFromPoster,
} = require('../controllers/jobController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Extract job fields from a hiring poster image (AI) — does not create the job.
// Part of the create flow, so open to anyone who can create a job.
router.post(
  '/extract-poster',
  protect,
  authorize('Admin', 'Recruiter', 'Hiring Manager'),
  upload.single('poster'),
  extractJobFromPoster
);

router.route('/')
  .get(protect, getJobs)
  .post(protect, authorize('Admin', 'Recruiter', 'Hiring Manager'), createJob);

router.route('/:id')
  .get(protect, getJobById)
  .put(protect, authorize('Admin', 'Recruiter'), updateJob)
  .delete(protect, authorize('Admin', 'Recruiter'), deleteJob);

router.post('/:id/duplicate', protect, authorize('Admin', 'Recruiter'), duplicateJob);
router.put('/:id/close', protect, authorize('Admin', 'Recruiter'), closeJob);
router.put('/:id/archive', protect, authorize('Admin', 'Recruiter'), archiveJob);
router.put('/:id/activate', protect, authorize('Admin', 'Recruiter'), activateJob);

module.exports = router;
