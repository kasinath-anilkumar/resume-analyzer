const CandidateRepo = require('../models/candidateRepo');
const JobRepo = require('../models/jobRepo');
const { computeAnalytics } = require('../services/analyticsService');
const { getOrCompute, invalidate } = require('../utils/ttlCache');

// Cached ~30s: this aggregates the whole candidate pool, so at 50 branches many
// concurrent loads would each be a full scan. The "Refresh" button sends ?fresh=1
// to bypass the cache on demand.
const ANALYTICS_TTL_MS = 30 * 1000;

async function computeAnalyticsData() {
  const [candidates, jobs] = await Promise.all([
    CandidateRepo.allForAnalytics(),
    JobRepo.list({}), // excludes Archived
  ]);
  return computeAnalytics(candidates, jobs);
}

// @desc    Recruiter analytics bundle — conversion funnel, source effectiveness,
//          AI verdict/score distributions, seniority mix, quiz stats, approximate
//          time-to-hire, and per-job performance.
// @route   GET /api/analytics
// @access  Private (any authenticated recruiter/hiring manager)
exports.getAnalytics = async (req, res) => {
  try {
    if (req.query.fresh) invalidate('analytics');
    const data = await getOrCompute('analytics', ANALYTICS_TTL_MS, computeAnalyticsData);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ success: false, message: 'Server error building analytics' });
  }
};
