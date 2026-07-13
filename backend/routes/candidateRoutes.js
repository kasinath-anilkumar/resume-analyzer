const express = require('express');
const router = express.Router();
const {
  uploadResume,
  getCandidates,
  getCandidateById,
  updateCandidateStatus,
  addNote,
  deleteNote,
  deleteCandidate,
  getDashboardStats,
} = require('../controllers/candidateController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Dashboard statistics
router.get('/dashboard/stats', protect, getDashboardStats);

// Upload resume & retrieve candidates
router.route('/')
  .get(protect, getCandidates)
  .post(protect, authorize('Admin', 'Recruiter'), upload.single('resume'), uploadResume);

// Single candidate operations
router.route('/:id')
  .get(protect, getCandidateById)
  .delete(protect, authorize('Admin', 'Recruiter'), deleteCandidate);

router.put('/:id/status', protect, authorize('Admin', 'Recruiter'), updateCandidateStatus);

// Notes operations
router.post('/:id/notes', protect, addNote);
router.delete('/:id/notes/:noteId', protect, deleteNote);

module.exports = router;
