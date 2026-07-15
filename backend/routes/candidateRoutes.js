const express = require('express');
const router = express.Router();
const {
  uploadResume,
  createManualCandidate,
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
  backfillEmbeddings,
  getDashboardStats,
  scheduleInterview,
  deleteInterview,
  moveCandidateJob,
  reanalyzeCandidate,
  getResumeSignedUrl,
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

// Manually add a candidate (no résumé) — declared before '/:id'.
router.post('/manual', protect, authorize('Admin', 'Recruiter'), createManualCandidate);

// Backfill semantic-matching embeddings for existing candidates + jobs.
router.post('/embeddings/backfill', protect, authorize('Admin'), backfillEmbeddings);

// Upload resume & retrieve candidates
router.route('/')
  .get(protect, getCandidates)
  .post(protect, authorize('Admin', 'Recruiter'), upload.single('resume'), upload.validateResumeContent, uploadResume);

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

// Short-lived signed URL to view/download the candidate's résumé (private bucket).
router.get('/:id/resume-url', protect, getResumeSignedUrl);

// Move to a different job / re-run AI analysis
router.put('/:id/job', protect, authorize('Admin', 'Recruiter'), moveCandidateJob);
router.post('/:id/reanalyze', protect, authorize('Admin', 'Recruiter'), reanalyzeCandidate);

// Interview scheduling
router.post('/:id/interviews', protect, authorize('Admin', 'Recruiter'), scheduleInterview);
router.delete('/:id/interviews/:interviewId', protect, authorize('Admin', 'Recruiter'), deleteInterview);

// Notes operations — writing notes is a recruiting action, so restrict to
// Admin/Recruiter (a Hiring Manager can view but not annotate candidates).
router.post('/:id/notes', protect, authorize('Admin', 'Recruiter'), addNote);
router.delete('/:id/notes/:noteId', protect, deleteNote);

module.exports = router;
