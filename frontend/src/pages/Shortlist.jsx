import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles, Briefcase, Loader2, AlertCircle, CheckCircle, XCircle,
  AlertTriangle, ChevronRight, Award, TrendingUp, Users, ThumbsUp, ThumbsDown
} from 'lucide-react';

const VERDICT_ORDER = ['Strong Fit', 'Potential Fit', 'Weak Fit', 'Not a Fit', 'Unscored'];
// Literal class strings (Tailwind can't compile dynamically-built class names).
const VERDICT_META = {
  'Strong Fit': { icon: CheckCircle, iconClass: 'text-emerald-500' },
  'Potential Fit': { icon: ThumbsUp, iconClass: 'text-brand-500' },
  'Weak Fit': { icon: AlertCircle, iconClass: 'text-amber-500' },
  'Not a Fit': { icon: XCircle, iconClass: 'text-rose-500' },
  'Unscored': { icon: Users, iconClass: 'text-slate-400' },
};

const scoreColor = (s = 0) =>
  s >= 80 ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
    : s >= 60 ? 'text-amber-600 bg-amber-500/10 border-amber-500/20'
      : 'text-rose-600 bg-rose-500/10 border-rose-500/20';

const Shortlist = () => {
  const { user } = useAuth();
  const isHR = ['Admin', 'Recruiter'].includes(user?.role);
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get('/jobs?status=Active')
      .then((res) => {
        if (res.data.success) {
          setJobs(res.data.data);
          if (res.data.data.length) setJobId(res.data.data[0]._id);
          else setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchCandidates = async () => {
    if (!jobId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await api.get(`/candidates?jobId=${jobId}`);
      if (res.data.success) {
        const ranked = [...res.data.data].sort(
          (a, b) => (b.aiAnalysis?.overallScore || 0) - (a.aiAnalysis?.overallScore || 0)
        );
        setCandidates(ranked);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCandidates(); }, [jobId]);

  const setStatus = async (cand, status) => {
    setBusyId(cand._id);
    try {
      const res = await api.put(`/candidates/${cand._id}/status`, { status });
      if (res.data.success) {
        setCandidates((prev) => prev.map((c) => (c._id === cand._id ? { ...c, status } : c)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  };

  // Group by verdict
  const groups = VERDICT_ORDER.map((v) => ({
    verdict: v,
    items: candidates.filter((c) => (c.aiAnalysis?.screeningVerdict || 'Unscored') === v),
  })).filter((g) => g.items.length);

  const total = candidates.length;
  const strong = candidates.filter((c) => c.aiAnalysis?.screeningVerdict === 'Strong Fit').length;
  const avg = total ? Math.round(candidates.reduce((s, c) => s + (c.aiAnalysis?.overallScore || 0), 0) / total) : 0;

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center">
            <Sparkles size={18} className="mr-2 text-brand-500" /> AI Shortlist
          </h2>
          <p className="text-xs text-slate-500">Candidates auto-ranked by AI fit for a job — act on the strongest first.</p>
        </div>
        <div className="flex items-center space-x-2 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder px-3 py-1.5 rounded-lg shadow-sm">
          <Briefcase size={14} className="text-slate-400" />
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="border-none bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none max-w-[220px]"
          >
            {jobs.length === 0 ? <option value="">No Active Jobs</option> : jobs.map((j) => (
              <option key={j._id} value={j._id}>{j.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary tiles */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={Users} label="Candidates" value={total} accentClass="bg-brand-500/10 text-brand-600 dark:text-brand-400" />
          <StatTile icon={Award} label="Strong Fits" value={strong} accentClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
          <StatTile icon={TrendingUp} label="Avg AI Score" value={`${avg}%`} accentClass="bg-brand-500/10 text-brand-600 dark:text-brand-400" />
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-24"><Loader2 size={30} className="animate-spin text-brand-500" /></div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <Sparkles className="text-slate-300 dark:text-slate-700 mb-3" size={38} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No candidates for this job yet</h3>
          <p className="text-xs text-slate-400 mt-1">Upload résumés against this opening to see the AI ranking.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const meta = VERDICT_META[g.verdict];
            const Icon = meta.icon;
            return (
              <div key={g.verdict} className="space-y-2">
                <div className="flex items-center gap-2 px-0.5">
                  <Icon size={14} className={meta.iconClass} />
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{g.verdict}</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{g.items.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {g.items.map((c, idx) => {
                    const a = c.aiAnalysis || {};
                    return (
                      <div key={c._id} className="p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-sm flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <span className={`w-10 h-10 rounded-xl border flex items-center justify-center text-sm font-black ${scoreColor(a.overallScore)}`}>
                            {a.overallScore ?? 0}
                          </span>
                          <span className="text-[9px] text-slate-400 font-semibold">RANK</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link to={`/candidates/${c._id}`} className="font-bold text-sm text-slate-800 dark:text-slate-100 hover:text-brand-500 hover:underline truncate">
                              {c.name}
                            </Link>
                            {a.seniorityLevel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{a.seniorityLevel}</span>}
                            {a.redFlags?.length > 0 && (
                              <span title={a.redFlags.map((f) => f.type).join(', ')} className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                <AlertTriangle size={9} /> {a.redFlags.length}
                              </span>
                            )}
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{c.status}</span>
                          </div>
                          <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {a.careerSummary || a.matchExplanation || 'No summary available.'}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(a.matchedSkills || []).slice(0, 4).map((s, i) => (
                              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">{s}</span>
                            ))}
                          </div>
                          {isHR && (
                            <div className="flex items-center gap-2 mt-2.5">
                              <button
                                onClick={() => setStatus(c, 'Shortlisted')}
                                disabled={busyId === c._id || c.status === 'Shortlisted'}
                                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition"
                              >
                                <ThumbsUp size={11} /> Shortlist
                              </button>
                              <button
                                onClick={() => setStatus(c, 'Rejected')}
                                disabled={busyId === c._id || c.status === 'Rejected'}
                                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-40 transition"
                              >
                                <ThumbsDown size={11} /> Reject
                              </button>
                              <Link to={`/candidates/${c._id}`} className="flex items-center gap-0.5 text-[10px] font-semibold text-brand-500 hover:underline ml-auto">
                                Review <ChevronRight size={11} />
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StatTile = ({ icon: Icon, label, value, accentClass = 'bg-brand-500/10 text-brand-600 dark:text-brand-400' }) => (
  <div className="p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className={`p-1.5 rounded-lg ${accentClass}`}><Icon size={14} /></div>
    </div>
    <div className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{value}</div>
  </div>
);

export default Shortlist;
