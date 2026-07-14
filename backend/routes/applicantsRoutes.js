const express = require('express');
const router = express.Router();
const {
  listApplicants, getApplicantDetails, updateApplicant,
  deleteApplicantAccount, erasePerson, sendReset,
} = require('../controllers/applicantsController');
const { protect, authorize } = require('../middleware/auth');

// Recruiter/admin view + management of careers-portal registrants.
router.get('/', protect, authorize('Admin', 'Recruiter'), listApplicants);
router.get('/:id', protect, authorize('Admin', 'Recruiter'), getApplicantDetails);
router.put('/:id', protect, authorize('Admin', 'Recruiter'), updateApplicant);
router.delete('/:id', protect, authorize('Admin', 'Recruiter'), deleteApplicantAccount);
router.delete('/:id/erase', protect, authorize('Admin', 'Recruiter'), erasePerson);
router.post('/:id/send-reset', protect, authorize('Admin', 'Recruiter'), sendReset);

module.exports = router;
