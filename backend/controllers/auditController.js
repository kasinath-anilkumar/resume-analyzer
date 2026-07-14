const AuditRepo = require('../models/auditRepo');

// @desc    List audit-log entries (paginated, filterable)
// @route   GET /api/audit
// @access  Private (Admin)
exports.listAudit = async (req, res) => {
  try {
    const { actorId, action, entityType, page, limit } = req.query;
    const result = await AuditRepo.list({ actorId, action, entityType, page, limit });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('List audit error:', error);
    return res.status(500).json({ success: false, message: 'Server error loading audit log' });
  }
};
