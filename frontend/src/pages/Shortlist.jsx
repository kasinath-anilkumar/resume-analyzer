import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles, Briefcase, Loader2, AlertCircle, CheckCircle, AlertTriangle,
  ChevronRight, Award, Users, ThumbsUp, ThumbsDown, RefreshCw, ArrowRightLeft, Shuffle,
  BrainCircuit, Wand2
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
  const isAdmin = user?.role === 'Admin';
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [semantic, setSemantic] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState('');

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
      if (res.data.success) {
        setCandidates(res.data.data); // already ranked by fit
        setSemantic(Boolean(res.data.semantic));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchRecommendations(); }, [fetchRecommendations]);

  // Admin: (re)build the embedding index so semantic matching covers all existing
  // candidates + jobs. New rows are embedded automatically after analysis.
  const rebuildIndex = async () => {
    setBackfilling(true);
    setBackfillMsg('');
    try {
      const res = await api.post('/candidates/embeddings/backfill');
      setBackfillMsg(res.data?.message || 'Semantic index updated.');
      await fetchRecommendations();
    } catch (err) {
      setBackfillMsg(err.response?.data?.message || 'Could not update the semantic index.');
    } finally {
      setBackfilling(false);
    }
  };

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
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles size={18} className="text-brand-500" /> Recommended Candidates
            {semantic && (
              <span title="Scores blended with AI embedding similarity so semantically-related résumés surface even without exact keyword matches" className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-brand-500/15 to-indigo-500/15 text-brand-600 dark:text-brand-300 border border-brand-500/20">
                <BrainCircuit size={11} /> Semantic AI
              </span>
            )}
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500">Your whole talent pool ranked by fit for this role — including strong candidates who applied elsewhere.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={rebuildIndex}
              disabled={backfilling}
              title="Rebuild the AI semantic index for all existing candidates & jobs"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder shadow-sm text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-brand-500 disabled:opacity-40 transition"
            >
              {backfilling ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              <span className="hidden sm:inline">{backfilling ? 'Indexing…' : 'Rebuild index'}</span>
            </button>
          )}
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
              className="border-none bg-transparent text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none max-w-[220px]"
            >
              {jobs.length === 0 ? <option value="">No Active Jobs</option> : jobs.map((j) => (
                <option key={j._id} value={j._id}>{j.title}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {backfillMsg && (
        <div className="flex items-center gap-2 text-[11px] font-medium text-brand-700 dark:text-brand-300 bg-brand-500/5 border border-brand-500/15 rounded-lg px-3 py-2">
          <BrainCircuit size={13} className="shrink-0" />
          <span>{backfillMsg}</span>
        </div>
      )}

      {/* Summary tiles */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
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
                  <h3 className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{meta.label}</h3>
                  <span className="text-[8px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{g.items.length}</span>
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
          <Link to={`/candidates/${c._id}`} className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 hover:text-brand-500 hover:underline truncate">
            {c.name}
          </Link>
          {c.seniorityLevel && <span className="text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{c.seniorityLevel}</span>}
          {c.redFlags?.length > 0 && (
            <span title={c.redFlags.map((f) => f.type).join(', ')} className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20">
              <AlertTriangle size={9} /> {c.redFlags.length}
            </span>
          )}
          {/* The cross-role signal: where they actually applied. */}
          {c.appliedHere ? (
            <span className="text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Applied here</span>
          ) : (
            <span title={`Applied for: ${c.appliedJob?.title || '—'}`} className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 max-w-[150px] sm:max-w-[200px]">
              <ArrowRightLeft size={9} className="shrink-0" />
              <span className="truncate">Applied for: {c.appliedJob?.title || '—'}</span>
            </span>
          )}
          <span className="text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{c.status}</span>
          {m.semantic && m.semanticScore != null && (
            <span
              title={`AI semantic similarity to this role: ${m.semanticScore}%${m.score > m.deterministicScore ? ` — boosted this fit from ${m.deterministicScore}` : ''}`}
              className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20"
            >
              <BrainCircuit size={9} className="shrink-0" /> AI {m.semanticScore}
              {m.score > m.deterministicScore && <span className="text-emerald-500">↑</span>}
            </span>
          )}
        </div>

        <p className="text-[9.5px] sm:text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{m.reason || c.careerSummary || 'No summary available.'}</p>

        {/* Matched skills for THIS role; transferable ones (inferred from experience) marked with ~ */}
        {(m.matchedRequired || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {m.matchedRequired.slice(0, 5).map((s, i) => (
              <span
                key={i}
                title={transferable.has(s) ? 'Inferred from experience' : 'Listed skill'}
                className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded border ${transferable.has(s)
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'}`}
              >
                {transferable.has(s) ? `~${s}` : s}
              </span>
            ))}
          </div>
        )}

        {isHR && (
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {c.appliedHere ? (
              <>
                <button
                  onClick={() => onStatus(c, 'Shortlisted')}
                  disabled={busy || c.status === 'Shortlisted'}
                  className="flex items-center justify-center gap-1 text-[10px] font-semibold p-2 sm:px-2.5 sm:py-1 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition"
                  title="Shortlist candidate"
                >
                  <ThumbsUp size={11} className="shrink-0" />
                  <span className="hidden sm:inline">Shortlist</span>
                </button>
                <button
                  onClick={() => onStatus(c, 'Rejected')}
                  disabled={busy || c.status === 'Rejected'}
                  className="flex items-center justify-center gap-1 text-[10px] font-semibold p-2 sm:px-2.5 sm:py-1 rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-40 transition"
                  title="Reject candidate"
                >
                  <ThumbsDown size={11} className="shrink-0" />
                  <span className="hidden sm:inline">Reject</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => onMove(c)}
                disabled={busy}
                className="flex items-center justify-center gap-1 text-[10px] font-semibold p-2 sm:px-2.5 sm:py-1 rounded-lg bg-brand-500/10 text-brand-600 border border-brand-500/20 hover:bg-brand-500/20 disabled:opacity-40 transition"
                title="Move candidate to this role"
              >
                {busy ? <Loader2 size={11} className="animate-spin shrink-0" /> : <ArrowRightLeft size={11} className="shrink-0" />}
                <span className="hidden sm:inline">Move to this role</span>
              </button>
            )}
            <Link to={`/candidates/${c._id}`} className="flex items-center gap-0.5 text-[10px] font-semibold text-brand-500 hover:underline ml-auto" title="Review candidate details">
              <span className="hidden sm:inline">Review</span> <ChevronRight size={11} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

const StatTile = ({ icon: Icon, label, value, accentClass = 'bg-brand-500/10 text-brand-600 dark:text-brand-400' }) => (
  <div className="p-2.5 sm:p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
    <div className="flex items-center justify-between gap-1.5">
      <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</span>
      <div className={`p-1 sm:p-1.5 rounded-lg ${accentClass} shrink-0`}><Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></div>
    </div>
    <div className="text-lg sm:text-2xl font-black text-slate-800 dark:text-slate-100 mt-0.5 sm:mt-1">{value}</div>
  </div>
);

export default Shortlist;
