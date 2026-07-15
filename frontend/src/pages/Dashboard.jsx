import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import {
  Briefcase,
  Users,
  CheckCircle,
  XCircle,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';

const COLORS = ['#4f73a5', '#6366f1', '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#ec4899'];

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/candidates/dashboard/stats');
      if (res.data.success) setStats(res.data.data);
    } catch (err) {
      console.error('Error fetching dashboard stats', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  // Live-refresh on tab focus + every 30s (cheap — the endpoint is server-cached).
  useLiveRefresh(fetchStats, { pollMs: 30000 });

  if (loading) {
    return <DashboardSkeleton />;
  }

  const { kpis, funnelData, applicationsPerJob, statusDistribution, skillDistribution, monthlyActivity } = stats || {
    kpis: { totalJobs: 0, activeJobs: 0, totalCandidates: 0, shortlistedCount: 0, shortlistedReached: 0, rejectedCount: 0, hiredCount: 0, interviewCount: 0 },
    funnelData: [],
    applicationsPerJob: [],
    statusDistribution: [],
    skillDistribution: [],
    monthlyActivity: []
  };

  const cards = [
    { title: 'Total Jobs', value: kpis.totalJobs, subtitle: `${kpis.activeJobs} active postings`, icon: Briefcase, color: 'from-blue-500/10 to-indigo-500/5 text-blue-600 dark:text-blue-400', to: '/jobs' },
    { title: 'Total Candidates', value: kpis.totalCandidates, subtitle: 'Across all jobs', icon: Users, color: 'from-purple-500/10 to-indigo-500/5 text-purple-600 dark:text-purple-400', to: '/candidates' },
    { title: 'Shortlisted', value: kpis.shortlistedReached, subtitle: `${((kpis.shortlistedReached / (kpis.totalCandidates || 1)) * 100).toFixed(0)}% reached shortlist`, icon: CheckCircle, color: 'from-emerald-500/10 to-teal-500/5 text-emerald-600 dark:text-emerald-400', to: '/candidates?status=Shortlisted' },
    { title: 'Interviews Active', value: kpis.interviewCount, subtitle: 'Scheduled stages', icon: Calendar, color: 'from-amber-500/10 to-orange-500/5 text-amber-600 dark:text-amber-400', to: '/pipeline' },
    { title: 'Hired Candidates', value: kpis.hiredCount, subtitle: 'Positions closed', icon: UserCheck, color: 'from-brand-500/10 to-indigo-500/5 text-brand-600 dark:text-brand-400', to: '/candidates?status=Hired' },
    { title: 'Rejected', value: kpis.rejectedCount, subtitle: 'Archived profiles', icon: XCircle, color: 'from-rose-500/10 to-orange-500/5 text-rose-600 dark:text-rose-400', to: '/candidates?status=Rejected' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-300">

      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-gradient-to-r from-brand-600 to-indigo-700 text-white rounded-2xl shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="relative z-10 space-y-1.5">
          <h2 className="text-xl font-extrabold tracking-tight">Resume Analyzer</h2>
          <p className="text-xs text-brand-100 max-w-xl">
            Monitor applicant distributions, analyze skill gaps, and transition candidates across the hiring pipeline.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex space-x-3 relative z-10">
          <Link
            to="/jobs"
            className="flex items-center space-x-1.5 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold border border-white/10 transition"
          >
            <span>Job Board</span>
            <ArrowRight size={14} />
          </Link>
          <Link
            to="/candidates"
            className="flex items-center space-x-1.5 px-4 py-2 bg-white text-brand-700 hover:bg-slate-50 rounded-xl text-xs font-semibold transition"
          >
            <span>Review Applicants</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
        {cards.map((card, idx) => (
          <Link
            key={idx}
            to={card.to}
            className="p-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark flex flex-col justify-between cursor-pointer transition hover:border-brand-300 dark:hover:border-brand-700  focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {card.title}
              </span>
              <div className={`p-2 rounded-xl bg-gradient-to-br ${card.color}`}>
                <card.icon size={16} />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                {card.value}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-1">{card.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts Block - Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Monthly Activity Area Chart */}
        <div className="lg:col-span-2 p-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Monthly Application Trends</h3>
              <p className="text-[11px] text-slate-400">Applications received vs candidates hired over time.</p>
            </div>
            <div className="flex items-center space-x-1 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-darkBorder/60 p-1 rounded-lg text-[10px] text-slate-500">
              <TrendingUp size={12} className="text-emerald-500" />
              <span>Real-time</span>
            </div>
          </div>
          <div className="h-72 w-full">
            {monthlyActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorHires" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" className="hidden dark:block" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="Applications" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorApps)" />
                  <Area type="monotone" dataKey="Hired" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorHires)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* Status Distribution Pie Chart */}
        <div className="p-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Candidate Pipeline Mix</h3>
            <p className="text-[11px] text-slate-400">Current status breakdowns of all applicants.</p>
          </div>
          <div className="h-64 relative flex items-center justify-center my-4">
            {statusDistribution.some(s => s.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '11px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {statusDistribution.map((entry, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span className="text-slate-500 truncate">{entry.name}</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">({entry.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Block - Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Hiring Funnel Bar Chart */}
        <div className="p-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Pipeline Progression Funnel</h3>
            <p className="text-[11px] text-slate-400">Counts of candidates progressing through the selection stages.</p>
          </div>
          <div className="h-72 mt-6">
            {funnelData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" className="hidden dark:block" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="value" fill="#4f73a5" radius={[4, 4, 0, 0]}>
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* Skill Distribution Grid / Bar Chart */}
        <div className="p-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark mb-5 sm:mb-5 md:mb-0">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Talent Skill Gap Aggregates</h3>
            <p className="text-[11px] text-slate-400">Frequency of technical and soft skills in parsed candidate profiles.</p>
          </div>
          <div className="h-72 mt-6">
            {skillDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={skillDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" className="hidden dark:block" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

// Render when data is completely empty
const EmptyState = () => (
  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 bg-slate-50 dark:bg-slate-900/20 rounded-xl">
    <Layers className="text-slate-300 dark:text-slate-700" size={32} />
    <h4 className="text-xs font-bold text-slate-500">No Analytics Available</h4>
    <p className="text-[10px] text-slate-400 max-w-[200px]">
      Upload resumes and match candidates to active jobs to populate chart analytics.
    </p>
  </div>
);

// Loading skeleton
const DashboardSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    <div className="grid grid-cols-2 md:grid-cols-6 gap-5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    </div>
  </div>
);

export default Dashboard;
