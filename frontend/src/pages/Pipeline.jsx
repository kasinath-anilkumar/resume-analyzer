import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { Briefcase, ChevronRight, User, AlertCircle, Loader2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

const PIPELINE_STAGES = [
  'Applied', 'Screening', 'Shortlisted', 'Interview',
  'Technical Round', 'HR Round', 'Offer', 'Hired', 'Rejected',
];
const PAGE_SIZE = 12;

const Pipeline = () => {
  const { user } = useAuth();
  const isHR = ['Admin', 'Recruiter'].includes(user?.role);

  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [activeStage, setActiveStage] = useState('Applied');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [stageCounts, setStageCounts] = useState({}); // { stage: exact count }
  const [candidates, setCandidates] = useState([]);   // current stage + page only
  const [total, setTotal] = useState(0);              // active stage total

  const [loading, setLoading] = useState(true);       // initial / job switch
  const [loadingCards, setLoadingCards] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  // Load active jobs.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/jobs?status=Active');
        if (res.data.success) {
          setJobs(res.data.data);
          if (res.data.data.length > 0) setSelectedJobId(res.data.data[0]._id);
          else setLoading(false);
        } else setLoading(false);
      } catch { setLoading(false); }
    })();
  }, []);

  // Debounce the search box (server-side search).
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Exact per-stage counts (for the tab badges) — independent of what's paged in.
  const fetchCounts = useCallback(async (jobId) => {
    if (!jobId) return;
    try {
      const res = await api.get(`/candidates/pipeline-counts?jobId=${jobId}`);
      if (res.data.success) setStageCounts(res.data.data || {});
    } catch { /* keep last counts */ }
  }, []);

  // One page of the active stage (server-paginated + server-searched).
  const fetchStage = useCallback(async (jobId, stage, pg, q, silent) => {
    if (!jobId) { setLoading(false); return; }
    if (!silent) setLoadingCards(true);
    try {
      const params = new URLSearchParams({ jobId, status: stage, page: String(pg), pageSize: String(PAGE_SIZE) });
      if (q) params.set('search', q);
      const res = await api.get(`/candidates?${params.toString()}`);
      if (res.data.success) {
        setCandidates(res.data.data || []);
        setTotal(res.data.total ?? 0);
        // If a page emptied out (e.g. after moving the last card), step back.
        if ((res.data.data || []).length === 0 && pg > 1) setPage(pg - 1);
      }
    } catch (e) { console.error(e); }
    finally { setLoadingCards(false); setLoading(false); }
  }, []);

  // Job switch → reset + reload counts and the first page.
  useEffect(() => {
    if (!selectedJobId) return;
    setLoading(true);
    setPage(1);
    fetchCounts(selectedJobId);
    fetchStage(selectedJobId, activeStage, 1, debouncedSearch, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  // Stage / page / search change → reload the relevant page.
  useEffect(() => {
    if (!selectedJobId) return;
    fetchStage(selectedJobId, activeStage, page, debouncedSearch, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStage, page, debouncedSearch]);

  // Live: silently refresh counts + the current page every 20s / on focus.
  useLiveRefresh(() => {
    if (!selectedJobId) return;
    fetchCounts(selectedJobId);
    fetchStage(selectedJobId, activeStage, page, debouncedSearch, true);
  }, { pollMs: 20000, enabled: !!selectedJobId });

  const handleStageChange = async (candidateId, targetStage) => {
    if (!isHR || targetStage === activeStage) return;
    setUpdatingId(candidateId);
    const prevCands = candidates;
    // Optimistic: it leaves this stage's view; adjust the badges + total.
    setCandidates((prev) => prev.filter((c) => c._id !== candidateId));
    setStageCounts((prev) => ({
      ...prev,
      [activeStage]: Math.max(0, (prev[activeStage] || 1) - 1),
      [targetStage]: (prev[targetStage] || 0) + 1,
    }));
    setTotal((t) => Math.max(0, t - 1));
    try {
      const res = await api.put(`/candidates/${candidateId}/status`, { status: targetStage });
      if (!res.data.success) throw new Error('failed');
      fetchStage(selectedJobId, activeStage, page, debouncedSearch, true); // refill the gap
    } catch {
      setCandidates(prevCands);
      fetchCounts(selectedJobId);
    } finally {
      setUpdatingId(null);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10';
    if (score >= 60) return 'text-amber-500 bg-amber-500/10';
    return 'text-rose-500 bg-rose-500/10';
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 animate-in fade-in duration-300 flex flex-col min-h-[calc(100vh-140px)]">

      {/* Title & Select Job */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-sm sm:text-base md:text-xl font-extrabold text-slate-800 dark:text-slate-100">Hiring Pipeline Board</h2>
          <p className="text-[9px] sm:text-[10px] md:text-xs text-slate-500">
            Select pipeline stages to manage candidate progression steps.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder px-3 py-1.5 rounded-xl shadow-sm">
          <Briefcase size={14} className="text-slate-400" />
          <select
            value={selectedJobId}
            onChange={(e) => { setSelectedJobId(e.target.value); setActiveStage('Applied'); }}
            className="border-none bg-transparent text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            {jobs.length === 0 ? (
              <option value="">No Active Job Openings</option>
            ) : (
              jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)
            )}
          </select>
        </div>
      </div>

      {/* Stage Navigation Row (badges are exact counts, not just what's loaded) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin shrink-0">
        {PIPELINE_STAGES.map((stage) => {
          const stageTotal = stageCounts[stage] ?? 0;
          const isActive = activeStage === stage;
          return (
            <button
              key={stage}
              onClick={() => { setActiveStage(stage); setPage(1); }}
              className={`flex items-center gap-2 px-3 py-2 border transition-all shrink-0 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${
                isActive
                  ? 'bg-brand-600 text-white border-brand-600 shadow-md shadow-brand-500/10'
                  : 'bg-white dark:bg-darkCard hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300 border-slate-200/60 dark:border-darkBorder'
              }`}
            >
              <span>{stage}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold tabular-nums ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {stageTotal}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-brand-500" />
        </div>
      ) : !selectedJobId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard">
          <AlertCircle className="text-slate-300 dark:text-slate-700 mb-3" size={36} />
          <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400">No Job Opening Selected</h3>
          <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
            Create an active job opening first to begin managing pipelines.
          </p>
        </div>
      ) : (
        <div className="space-y-4 flex-1 flex flex-col justify-between">

          {/* Active Stage Panel & Search */}
          <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-brand-500">
                Stage: {activeStage}
              </h3>
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 tabular-nums">
                {total} candidate{total === 1 ? '' : 's'} in this stage{debouncedSearch ? ' (filtered)' : ''}.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search candidates by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          {/* Cards Grid */}
          {loadingCards && candidates.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <Loader2 size={26} className="animate-spin text-brand-500" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
              <User className="text-slate-300 dark:text-slate-700 mb-3" size={36} />
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">No Candidates Found</h3>
              <p className="text-[10px] text-slate-400 mt-1">
                There are no candidates in the "{activeStage}" stage{debouncedSearch ? ' matching your search' : ''}.
              </p>
            </div>
          ) : (
            <div className={`flex-1 transition-opacity ${loadingCards ? 'opacity-50' : ''}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {candidates.map((cand) => (
                  <div
                    key={cand._id}
                    className={`p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-sm relative transition hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between ${
                      updatingId === cand._id ? 'opacity-40 animate-pulse' : ''
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 leading-snug truncate">
                            {cand.name}
                          </h4>
                          <span className="text-[9px] text-slate-400 block mt-0.5 truncate">{cand.email}</span>
                        </div>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${getScoreColor(cand.aiAnalysis?.overallScore || 0)}`}>
                          {cand.aiAnalysis?.overallScore || 0}% Match
                        </span>
                      </div>

                      <div className="mt-3.5 space-y-1.5 text-[9.5px] text-slate-500 dark:text-slate-400 border-t border-b border-slate-100 dark:border-darkBorder/40 py-2.5">
                        <div className="flex items-center justify-between">
                          <span>Skills Match:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {cand.aiAnalysis?.matchedSkills?.length || 0} skills
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Verdict:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {cand.aiAnalysis?.screeningVerdict || 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-darkBorder/40">
                      <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold shrink-0">Stage:</span>
                        <select
                          value={cand.status}
                          onChange={(e) => handleStageChange(cand._id, e.target.value)}
                          disabled={!isHR || updatingId === cand._id}
                          className="flex-1 sm:flex-initial text-[9px] font-bold border border-slate-200 dark:border-darkBorder rounded-lg bg-slate-50 dark:bg-slate-900 p-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 min-w-0"
                        >
                          {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      <Link
                        to={`/candidates/${cand._id}`}
                        className="flex items-center justify-center space-x-0.5 text-[9px] uppercase tracking-wider font-bold text-brand-500 hover:text-brand-600 transition py-1 sm:py-0 w-full sm:w-auto border border-brand-500/20 sm:border-none rounded-lg sm:rounded-none bg-brand-500/5 sm:bg-transparent shrink-0"
                      >
                        <span>Review</span>
                        <ChevronRight size={10} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-100 dark:border-darkBorder/40 shrink-0">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loadingCards}
                className="px-3 py-1.5 border border-slate-200 dark:border-darkBorder rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                Previous
              </button>
              <span className="text-xs text-slate-400 font-bold tabular-nums">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loadingCards}
                className="px-3 py-1.5 border border-slate-200 dark:border-darkBorder rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Pipeline;
