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
  getTrash,
  restoreCandidate,
  permanentDeleteCandidate,
  deletePerson,
  exportCandidate,
  getRecommendations,
  getDashboardStats,
  scheduleInterview,
  deleteInterview,
  moveCandidateJob,
  reanalyzeCandidate,
} = require('../controllers/candidateController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Dashboard statistics
router.get('/dashboard/stats', protect, getDashboardStats);

// Cross-role recommendations: rank the whole pool against a job (must be
// declared before '/:id' so 'recommendations' isn't parsed as an id).
router.get('/recommendations', protect, getRecommendations);

// Trash (soft-deleted candidates). Declared before '/:id'.
router.get('/trash', protect, authorize('Admin', 'Recruiter'), getTrash);

// Upload resume & retrieve candidates
router.route('/')
  .get(protect, getCandidates)
  .post(protect, authorize('Admin', 'Recruiter'), upload.single('resume'), uploadResume);

// Single candidate operations
router.route('/:id')
  .get(protect, getCandidateById)
  .delete(protect, authorize('Admin', 'Recruiter'), deleteCandidate);

// Trash lifecycle + GDPR erasure
router.post('/:id/restore', protect, authorize('Admin', 'Recruiter'), restoreCandidate);
router.delete('/:id/permanent', protect, authorize('Admin', 'Recruiter'), permanentDeleteCandidate);
router.delete('/:id/person', protect, authorize('Admin', 'Recruiter'), deletePerson);

router.put('/:id/status', protect, authorize('Admin', 'Recruiter'), updateCandidateStatus);

// GDPR: export all data held for a candidate (subject-access request)
router.get('/:id/export', protect, authorize('Admin', 'Recruiter'), exportCandidate);

// Move to a different job / re-run AI analysis
router.put('/:id/job', protect, authorize('Admin', 'Recruiter'), moveCandidateJob);
router.post('/:id/reanalyze', protect, authorize('Admin', 'Recruiter'), reanalyzeCandidate);

// Interview scheduling
router.post('/:id/interviews', protect, authorize('Admin', 'Recruiter'), scheduleInterview);
router.delete('/:id/interviews/:interviewId', protect, authorize('Admin', 'Recruiter'), deleteInterview);

// Notes operations
router.post('/:id/notes', protect, addNote);
router.delete('/:id/notes/:noteId', protect, deleteNote);

module.exports = router;
