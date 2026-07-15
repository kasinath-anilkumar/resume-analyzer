const CandidateRepo = require('../models/candidateRepo');
const JobRepo = require('../models/jobRepo');
const { computeAnalytics } = require('../services/analyticsService');

// @desc    Recruiter analytics bundle — conversion funnel, source effectiveness,
//          AI verdict/score distributions, seniority mix, quiz stats, approximate
//          time-to-hire, and per-job performance. Computed live on read.
// @route   GET /api/analytics
// @access  Private (any authenticated recruiter/hiring manager)
exports.getAnalytics = async (req, res) => {
  try {
    const [candidates, jobs] = await Promise.all([
      CandidateRepo.allForAnalytics(),
      JobRepo.list({}), // excludes Archived
    ]);
    const data = computeAnalytics(candidates, jobs);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ success: false, message: 'Server error building analytics' });
  }
};
