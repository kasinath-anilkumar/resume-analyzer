import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
  Users, Sparkles, Gauge, UserCheck, Briefcase, Clock, RefreshCw,
  TrendingDown, ClipboardCheck, Layers, Info,
} from 'lucide-react';

const COLORS = ['#4f73a5', '#6366f1', '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#ec4899'];
const VERDICT_COLORS = {
  'Strong Fit': '#10b981', 'Potential Fit': '#3b82f6', 'Weak Fit': '#f59e0b',
  'Not a Fit': '#ef4444', 'Unscored': '#94a3b8',
};
const TOOLTIP_STYLE = {
  backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px',
  color: '#f8fafc', fontSize: '11px',
};

const Analytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (fresh = false) => {
    try {
      // Results are cached ~30s server-side; the Refresh button forces a rebuild.
      const res = await api.get(fresh ? '/analytics?fresh=1' : '/analytics');
      if (res.data.success) setData(res.data.data);
    } catch (err) {
      console.error('Error fetching analytics', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  // Live-refresh on tab focus + every 30s (cheap — analytics is server-cached; a
  // manual "Refresh" still forces a fresh recompute via ?fresh=1).
  useLiveRefresh(() => fetchData(false), { pollMs: 30000 });

  if (loading) return <AnalyticsSkeleton />;

  const d = data || {};
  const totals = d.totals || {};
  const conversion = d.conversion || [];
  const sourceEffectiveness = d.sourceEffectiveness || [];
  const verdictDistribution = (d.verdictDistribution || []).filter((v) => v.value > 0);
  const scoreHistogram = d.scoreHistogram || [];
  const seniorityMix = d.seniorityMix || [];
  const quizStats = d.quizStats || {};
  const timeToHire = d.timeToHire || {};
  const perJob = d.perJob || [];
  const applicationsOverTime = d.applicationsOverTime || [];

  const cards = [
    { title: 'Candidates', value: totals.totalCandidates ?? 0, subtitle: `${totals.analyzedCount ?? 0} AI-analyzed`, icon: Users, color: 'from-purple-500/10 to-indigo-500/5 text-purple-600 dark:text-purple-400' },
    { title: 'Avg AI Score', value: totals.avgScore ?? 0, subtitle: 'Across analyzed résumés', icon: Gauge, color: 'from-blue-500/10 to-indigo-500/5 text-blue-600 dark:text-blue-400' },
    { title: 'Hired', value: totals.hiredCount ?? 0, subtitle: 'Positions filled', icon: UserCheck, color: 'from-emerald-500/10 to-teal-500/5 text-emerald-600 dark:text-emerald-400' },
    { title: 'Active Roles', value: totals.activeJobs ?? 0, subtitle: `${totals.totalJobs ?? 0} total postings`, icon: Briefcase, color: 'from-brand-500/10 to-indigo-500/5 text-brand-600 dark:text-brand-400' },
    { title: 'Time to Hire', value: timeToHire.sample > 0 ? `${timeToHire.avgDays}d` : '—', subtitle: timeToHire.sample > 0 ? `median ${timeToHire.medianDays}d · approx` : 'No hires yet', icon: Clock, color: 'from-amber-500/10 to-orange-500/5 text-amber-600 dark:text-amber-400' },
    { title: 'Quiz Pass Rate', value: quizStats.taken > 0 ? `${quizStats.passRate}%` : '—', subtitle: quizStats.taken > 0 ? `${quizStats.taken} took · avg ${quizStats.avgScore}` : 'No quizzes taken', icon: ClipboardCheck, color: 'from-rose-500/10 to-pink-500/5 text-rose-600 dark:text-rose-400' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black text-white rounded-2xl shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="relative z-10 space-y-1.5">
          <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <TrendingDown size={20} className="rotate-180" /> Recruiting Analytics
          </h2>
          <p className="text-xs text-slate-300 max-w-xl">
            Conversion funnel, sourcing quality, AI screening spread, and per-role performance — computed live from your pipeline.
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetchData(true); }}
          className="mt-4 md:mt-0 relative z-10 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-xs font-semibold border border-white/10 transition"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card, idx) => (
          <div key={idx} className="p-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{card.title}</span>
              <div className={`p-2 rounded-xl bg-gradient-to-br ${card.color}`}><card.icon size={16} /></div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{card.value}</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-1">{card.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Row 1: Conversion funnel + Verdict distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Conversion Funnel</h3>
            <p className="text-[11px] text-slate-400">Share of candidates passing each hiring gate (cumulative — advancing past a stage still counts it).</p>
          </div>
          <FunnelBars conversion={conversion} applied={totals.totalCandidates ?? 0} />
        </div>

        <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark flex flex-col">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">AI Verdict Spread</h3>
            <p className="text-[11px] text-slate-400">Screening verdicts across analyzed résumés.</p>
          </div>
          <div className="h-56 relative flex items-center justify-center my-2">
            {verdictDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={verdictDistribution} innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {verdictDistribution.map((entry, i) => (
                      <Cell key={i} fill={VERDICT_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {verdictDistribution.map((entry, idx) => (
              <div key={idx} className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: VERDICT_COLORS[entry.name] || COLORS[idx % COLORS.length] }} />
                <span className="text-slate-500 truncate">{entry.name}</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">({entry.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Score histogram + Seniority mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="AI Score Distribution" subtitle="How analyzed candidates spread across the 0–100 match score.">
          {scoreHistogram.some((b) => b.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreHistogram} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <GridLines />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="value" name="Candidates" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40}>
                  {scoreHistogram.map((entry, i) => (
                    <Cell key={i} fill={i >= 3 ? '#10b981' : i === 2 ? '#3b82f6' : i === 1 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Seniority Mix" subtitle="Experience level inferred by the AI across the talent pool.">
          {seniorityMix.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seniorityMix} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 0 }}>
                <GridLines vertical />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" width={60} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="value" name="Candidates" fill="#4f73a5" radius={[0, 4, 4, 0]} barSize={18}>
                  {seniorityMix.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      </div>

      {/* Row 3: Source effectiveness */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Source Effectiveness</h3>
          <p className="text-[11px] text-slate-400">Which intake channel yields the strongest candidates.</p>
        </div>
        {sourceEffectiveness.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sourceEffectiveness.map((s) => (
              <div key={s.source} className="p-3 rounded-xl border border-slate-200/70 dark:border-darkBorder/70 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.source === 'Application' ? 'Careers Portal' : s.source}</span>
                  <span className="text-[10px] font-semibold text-slate-400">{s.count} candidate{s.count === 1 ? '' : 's'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Avg Score" value={s.avgScore} />
                  <MiniStat label="Shortlist %" value={`${s.shortlistRate}%`} />
                  <MiniStat label="Hire %" value={`${s.hireRate}%`} />
                </div>
              </div>
            ))}
          </div>
        ) : <div className="py-8"><EmptyState /></div>}
      </div>

      {/* Row 4: Applications over time */}
      <ChartCard title="Applications & Hires Over Time" subtitle="Monthly intake vs candidates marked hired (last 6 months)." tall>
        {applicationsOverTime.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={applicationsOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="aApps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="aHires" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <GridLines />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Area type="monotone" dataKey="Applications" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#aApps)" />
              <Area type="monotone" dataKey="Hired" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#aHires)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyState />}
      </ChartCard>

      {/* Row 5: Per-job performance table */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Per-Role Performance</h3>
          <p className="text-[11px] text-slate-400">Applications, screening quality, and outcomes by open role.</p>
        </div>
        {perJob.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200/70 dark:border-darkBorder/70">
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 px-3 font-semibold text-right">Apps</th>
                  <th className="py-2 px-3 font-semibold text-right">Avg Score</th>
                  <th className="py-2 px-3 font-semibold text-right">Shortlist %</th>
                  <th className="py-2 px-3 font-semibold text-right">Interviews</th>
                  <th className="py-2 pl-3 font-semibold text-right">Hires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/50">
                {perJob.map((row) => (
                  <tr key={row.jobId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[220px]">{row.title}</div>
                      <div className="text-[10px] text-slate-400">{row.department}{row.status !== 'Active' ? ` · ${row.status}` : ''}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-600 dark:text-slate-300">{row.applications}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`font-bold ${row.avgScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : row.avgScore >= 50 ? 'text-amber-600 dark:text-amber-400' : row.avgScore > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                        {row.avgScore || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">{row.shortlistRate}%</td>
                    <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">{row.interviews}</td>
                    <td className="py-2.5 pl-3 text-right font-bold text-slate-700 dark:text-slate-200">{row.hires}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="py-8"><EmptyState /></div>}
      </div>

      {timeToHire.approximate && timeToHire.sample > 0 && (
        <p className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
          <Info size={11} />
          Time-to-hire is approximated from record create → last-update dates (no per-stage timestamp history is kept), so treat it as a directional signal.
        </p>
      )}
    </div>
  );
};

// --- Conversion funnel as stacked horizontal bars ---------------------------
const FunnelBars = ({ conversion, applied }) => {
  const rows = [
    { label: 'Applied', count: applied, rate: 100, base: null },
    ...conversion.map((c) => ({ label: c.to, count: c.count, rate: c.rate, base: c.from })),
  ];
  const max = Math.max(applied, 1);
  const barColor = (i) => COLORS[i % COLORS.length];
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{r.label}</span>
            <span className="text-slate-400">
              <span className="font-bold text-slate-600 dark:text-slate-300">{r.count}</span>
              {r.base && <span className="ml-1.5 text-[10px]">({r.rate}% of {r.base})</span>}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((r.count / max) * 100, r.count > 0 ? 3 : 0)}%`, backgroundColor: barColor(i) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const MiniStat = ({ label, value }) => (
  <div className="text-center">
    <div className="text-base font-black text-slate-800 dark:text-slate-100 leading-none">{value}</div>
    <div className="text-[9px] uppercase tracking-wide text-slate-400 mt-1">{label}</div>
  </div>
);

const ChartCard = ({ title, subtitle, children, tall }) => (
  <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
    <div>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="text-[11px] text-slate-400">{subtitle}</p>
    </div>
    <div className={`${tall ? 'h-72' : 'h-60'} mt-4`}>{children}</div>
  </div>
);

const GridLines = ({ vertical }) => (
  <>
    <CartesianGrid strokeDasharray="3 3" vertical={!!vertical} horizontal={!vertical} stroke="#e2e8f0" className="dark:hidden" />
    <CartesianGrid strokeDasharray="3 3" vertical={!!vertical} horizontal={!vertical} stroke="#1e293b" className="hidden dark:block" />
  </>
);

const EmptyState = () => (
  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 bg-slate-50 dark:bg-slate-900/20 rounded-xl">
    <Layers className="text-slate-300 dark:text-slate-700" size={28} />
    <h4 className="text-xs font-bold text-slate-500">No data yet</h4>
    <p className="text-[10px] text-slate-400 max-w-[200px]">Analyze candidates and move them through the pipeline to populate this view.</p>
  </div>
);

const AnalyticsSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    </div>
  </div>
);

export default Analytics;
