const express = require('express');
const router = express.Router();
const {
  createNotification,
  getMyNotifications,
  markRead,
  markAllRead,
  getAllNotifications,
  deleteNotification,
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getMyNotifications)
  .post(protect, authorize('Admin'), createNotification);

router.get('/manage', protect, authorize('Admin'), getAllNotifications);
router.put('/read-all', protect, markAllRead);
router.put('/:id/read', protect, markRead);
router.delete('/:id', protect, authorize('Admin'), deleteNotification);

module.exports = router;
