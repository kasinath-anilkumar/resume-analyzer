import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles, Briefcase, Loader2, AlertCircle, CheckCircle, AlertTriangle,
  ChevronRight, Award, Users, ThumbsUp, ThumbsDown, RefreshCw, ArrowRightLeft, Shuffle
} from 'lucide-react';

// Candidates are grouped by how well they fit THE SELECTED JOB (computed live by
// the deterministic matcher) — not by the score for the role they applied to.
const BAND_ORDER = ['Strong', 'Good', 'Possible', 'Low'];
const BAND_META = {
  Strong: { label: 'Strong Fit', icon: CheckCircle, iconClass: 'text-emerald-500' },
  Good: { label: 'Good Fit', icon: ThumbsUp, iconClass: 'text-brand-500' },
  Possible: { label: 'Possible Fit', icon: AlertCircle, iconClass: 'text-amber-500' },
  Low: { label: 'Low Match', icon: Users, iconClass: 'text-slate-400' },
};

const scoreColor = (s = 0) =>
  s >= 75 ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
    : s >= 55 ? 'text-brand-600 bg-brand-500/10 border-brand-500/20'
      : s >= 40 ? 'text-amber-600 bg-amber-500/10 border-amber-500/20'
        : 'text-slate-500 bg-slate-500/10 border-slate-500/20';

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

  const fetchRecommendations = useCallback(async () => {
    if (!jobId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await api.get(`/candidates/recommendations?jobId=${jobId}`);
      if (res.data.success) setCandidates(res.data.data); // already ranked by fit
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchRecommendations(); }, [fetchRecommendations]);

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

  // Reassign a cross-role candidate to the selected job, then refresh so their
  // fit is re-evaluated in context.
  const moveToRole = async (cand) => {
    const jobTitle = jobs.find((j) => j._id === jobId)?.title || 'this role';
    const from = cand.appliedJob?.title || 'their current role';
    if (!window.confirm(`Move ${cand.name} to "${jobTitle}"? This reassigns them from "${from}" — re-run AI analysis afterward for an accurate score.`)) return;
    setBusyId(cand._id);
    try {
      const res = await api.put(`/candidates/${cand._id}/job`, { jobId });
      if (res.data.success) await fetchRecommendations();
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  };

  const groups = BAND_ORDER
    .map((b) => ({ band: b, items: candidates.filter((c) => c.match?.band === b) }))
    .filter((g) => g.items.length);

  const total = candidates.length;
  const strong = candidates.filter((c) => c.match?.band === 'Strong').length;
  const crossRole = candidates.filter((c) => !c.appliedHere).length;

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center">
            <Sparkles size={18} className="mr-2 text-brand-500" /> AI Shortlist
          </h2>
          <p className="text-xs text-slate-500">Your whole talent pool ranked by fit for this role — including strong candidates who applied elsewhere.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRecommendations}
            disabled={loading || !jobId}
            title="Refresh recommendations"
            className="p-2 rounded-lg bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder shadow-sm text-slate-500 hover:text-brand-500 disabled:opacity-40 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
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
      </div>

      {/* Summary tiles */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={Users} label="Matches" value={total} accentClass="bg-brand-500/10 text-brand-600 dark:text-brand-400" />
          <StatTile icon={Award} label="Strong Fits" value={strong} accentClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
          <StatTile icon={Shuffle} label="From Other Roles" value={crossRole} accentClass="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-24"><Loader2 size={30} className="animate-spin text-brand-500" /></div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <Sparkles className="text-slate-300 dark:text-slate-700 mb-3" size={38} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No candidates match this role yet</h3>
          <p className="text-xs text-slate-400 mt-1">Upload résumés (for any role) — the analyzer will surface anyone who fits this one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const meta = BAND_META[g.band];
            const Icon = meta.icon;
            return (
              <div key={g.band} className="space-y-2">
                <div className="flex items-center gap-2 px-0.5">
                  <Icon size={14} className={meta.iconClass} />
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{meta.label}</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{g.items.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {g.items.map((c) => (
                    <RecCard
                      key={c._id}
                      c={c}
                      isHR={isHR}
                      busy={busyId === c._id}
                      onStatus={setStatus}
                      onMove={moveToRole}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RecCard = ({ c, isHR, busy, onStatus, onMove }) => {
  const m = c.match || {};
  const transferable = new Set(m.transferable || []);
  return (
    <div className="p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-sm flex items-start gap-3">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span className={`w-10 h-10 rounded-xl border flex items-center justify-center text-sm font-black ${scoreColor(m.score)}`}>
          {m.score ?? 0}
        </span>
        <span className="text-[9px] text-slate-400 font-semibold">FIT</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link to={`/candidates/${c._id}`} className="font-bold text-sm text-slate-800 dark:text-slate-100 hover:text-brand-500 hover:underline truncate">
            {c.name}
          </Link>
          {c.seniorityLevel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{c.seniorityLevel}</span>}
          {c.redFlags?.length > 0 && (
            <span title={c.redFlags.map((f) => f.type).join(', ')} className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20">
              <AlertTriangle size={9} /> {c.redFlags.length}
            </span>
          )}
          {/* The cross-role signal: where they actually applied. */}
          {c.appliedHere ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Applied here</span>
          ) : (
            <span title="Recommended from the talent pool" className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <ArrowRightLeft size={9} /> Applied for: {c.appliedJob?.title || '—'}
            </span>
          )}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{c.status}</span>
        </div>

        <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{m.reason || c.careerSummary || 'No summary available.'}</p>

        {/* Matched skills for THIS role; transferable ones (inferred from experience) marked with ~ */}
        {(m.matchedRequired || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {m.matchedRequired.slice(0, 5).map((s, i) => (
              <span
                key={i}
                title={transferable.has(s) ? 'Inferred from experience' : 'Listed skill'}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${transferable.has(s)
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'}`}
              >
                {transferable.has(s) ? `~${s}` : s}
              </span>
            ))}
          </div>
        )}

        {isHR && (
          <div className="flex items-center gap-2 mt-2.5">
            {c.appliedHere ? (
              <>
                <button
                  onClick={() => onStatus(c, 'Shortlisted')}
                  disabled={busy || c.status === 'Shortlisted'}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition"
                >
                  <ThumbsUp size={11} /> Shortlist
                </button>
                <button
                  onClick={() => onStatus(c, 'Rejected')}
                  disabled={busy || c.status === 'Rejected'}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-40 transition"
                >
                  <ThumbsDown size={11} /> Reject
                </button>
              </>
            ) : (
              <button
                onClick={() => onMove(c)}
                disabled={busy}
                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-600 border border-brand-500/20 hover:bg-brand-500/20 disabled:opacity-40 transition"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <ArrowRightLeft size={11} />} Move to this role
              </button>
            )}
            <Link to={`/candidates/${c._id}`} className="flex items-center gap-0.5 text-[10px] font-semibold text-brand-500 hover:underline ml-auto">
              Review <ChevronRight size={11} />
            </Link>
          </div>
        )}
      </div>
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
