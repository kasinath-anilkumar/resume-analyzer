const NotificationRepo = require('../models/notificationRepo');

const ROLES = ['Admin', 'Recruiter', 'Hiring Manager'];

// @desc    Send a notification
// @route   POST /api/notifications
// @access  Private (Admin)
exports.createNotification = async (req, res) => {
  try {
    const { title, message, targetType, targetRole, targetUserId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }
    if (!['all', 'role', 'user'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid target type.' });
    }
    if (targetType === 'role' && !ROLES.includes(targetRole)) {
      return res.status(400).json({ success: false, message: 'Select a valid role.' });
    }
    if (targetType === 'user' && !targetUserId) {
      return res.status(400).json({ success: false, message: 'Select a recipient account.' });
    }

    const base = {
      title: (title || '').trim(),
      message: message.trim(),
      sender: req.user.id,
      senderName: req.user.name || 'Admin',
      targetType,
      targetRole: targetType === 'role' ? targetRole : null,
      targetUser: targetType === 'user' ? targetUserId : null,
    };

    const n = await NotificationRepo.create(base);
    return res.status(201).json({ success: true, data: n });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error sending notification' });
  }
};

// @desc    Notifications for the current user (bell)
// @route   GET /api/notifications
// @access  Private
exports.getMyNotifications = async (req, res) => {
  try {
    const data = await NotificationRepo.getForUser(req.user);
    return res.json({
      success: true,
      count: data.length,
      unread: data.filter((n) => !n.read).length,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error loading notifications' });
  }
};

// @desc    Mark one notification read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markRead = async (req, res) => {
  try {
    await NotificationRepo.markRead(req.params.id, req.user.id);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error updating notification' });
  }
};

// @desc    Mark all my notifications read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllRead = async (req, res) => {
  try {
    await NotificationRepo.markAllRead(req.user);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error updating notifications' });
  }
};

// @desc    All notifications (admin management / "sent" view)
// @route   GET /api/notifications/manage
// @access  Private (Admin)
exports.getAllNotifications = async (req, res) => {
  try {
    const data = await NotificationRepo.getAll();
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error loading notifications' });
  }
};

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private (Admin)
exports.deleteNotification = async (req, res) => {
  try {
    await NotificationRepo.remove(req.params.id);
    return res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error deleting notification' });
  }
};
