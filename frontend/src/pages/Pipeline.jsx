import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { Briefcase, ChevronRight, User, AlertCircle, Loader2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

const PIPELINE_STAGES = [
  'Applied',
  'Screening',
  'Shortlisted',
  'Interview',
  'Technical Round',
  'HR Round',
  'Offer',
  'Hired',
  'Rejected'
];

const Pipeline = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  
  // High-Volume scaling states
  const [activeStage, setActiveStage] = useState('Applied');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 12;

  const isHR = ['Admin', 'Recruiter'].includes(user?.role);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await api.get('/jobs?status=Active');
        if (res.data.success) {
          setJobs(res.data.data);
          if (res.data.data.length > 0) {
            setSelectedJobId(res.data.data[0]._id);
          }
        }
      } catch (err) {
        console.error('Error fetching jobs', err);
      }
    };
    fetchJobs();
  }, []);

  const fetchCandidates = async (silent = false) => {
    if (!selectedJobId) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);
      // The board groups a job's whole pool by stage, so pull a large page (the
      // list endpoint is paginated — the default 25 would hide most candidates).
      const res = await api.get(`/candidates?jobId=${selectedJobId}&pageSize=500`);
      if (res.data.success) {
        setCandidates(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
    setPage(1); // Reset page on job select
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  // Live: silently re-fetch on tab focus + every 20s so stage moves / new
  // candidates (incl. other recruiters' changes) show up without a manual refresh.
  useLiveRefresh(() => fetchCandidates(true), { pollMs: 20000, enabled: !!selectedJobId });

  const handleStageChange = async (candidateId, targetStage) => {
    if (!isHR) return;
    setUpdatingId(candidateId);
    try {
      // Optimistic Local State Update
      setCandidates((prev) =>
        prev.map((c) => (c._id === candidateId ? { ...c, status: targetStage } : c))
      );

      const res = await api.put(`/candidates/${candidateId}/status`, { status: targetStage });
      if (!res.data.success) {
        fetchCandidates();
      }
    } catch (err) {
      console.error(err);
      fetchCandidates();
    } finally {
      setUpdatingId(null);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10';
    if (score >= 60) return 'text-amber-500 bg-amber-500/10';
    return 'text-rose-500 bg-rose-500/10';
  };

  // Filter candidates for selected stage & search name query
  const stageCandidates = candidates
    .filter((c) => c.status === activeStage)
    .filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.aiAnalysis?.overallScore || 0) - (a.aiAnalysis?.overallScore || 0));

  // Paginated candidates slice
  const totalItems = stageCandidates.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedCandidates = stageCandidates.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300 flex flex-col min-h-[calc(100vh-140px)]">
      
      {/* Title & Select Job */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-sm sm:text-base md:text-xl font-extrabold text-slate-800 dark:text-slate-100">Hiring Pipeline Board</h2>
          <p className="text-[9px] sm:text-[10px] md:text-xs text-slate-500">
            Select pipeline stages to manage candidate progression steps.
          </p>
        </div>

        {/* Job selector */}
        <div className="flex items-center space-x-2 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder px-3 py-1.5 rounded-xl shadow-sm">
          <Briefcase size={14} className="text-slate-400" />
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="border-none bg-transparent text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            {jobs.length === 0 ? (
              <option value="">No Active Job Openings</option>
            ) : (
              jobs.map((j) => (
                <option key={j._id} value={j._id}>{j.title}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Stage Navigation Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin flex-shrink-0">
        {PIPELINE_STAGES.map((stage) => {
          const stageTotal = candidates.filter((c) => c.status === stage).length;
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
              <span className={`px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {stageTotal}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content & List area */}
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
              <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">
                Showing {totalItems} matches in this stage (Sorted by AI Overall Score).
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search candidates by name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-9 pl-9 pr-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          {/* Cards Grid */}
          {paginatedCandidates.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
              <User className="text-slate-300 dark:text-slate-700 mb-3" size={36} />
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">No Candidates Found</h3>
              <p className="text-[10px] text-slate-400 mt-1">
                There are no candidates in the "{activeStage}" stage matching your filters.
              </p>
            </div>
          ) : (
            <div className="flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {paginatedCandidates.map((cand) => (
                  <div
                    key={cand._id}
                    className={`p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-sm relative transition hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between ${
                      updatingId === cand._id ? 'opacity-40 animate-pulse' : ''
                    }`}
                  >
                    <div>
                      {/* Name & Match Score */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 leading-snug truncate">
                            {cand.name}
                          </h4>
                          <span className="text-[9px] text-slate-400 block mt-0.5">{cand.email}</span>
                        </div>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${getScoreColor(cand.aiAnalysis?.overallScore || 0)}`}>
                          {cand.aiAnalysis?.overallScore || 0}% Match
                        </span>
                      </div>

                      {/* Info Panel */}
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

                    {/* Actions and Stage Selector */}
                    <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-darkBorder/40">
                      <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold shrink-0">Stage:</span>
                        <select
                          value={cand.status}
                          onChange={(e) => handleStageChange(cand._id, e.target.value)}
                          className="flex-1 sm:flex-initial text-[9px] font-bold border border-slate-200 dark:border-darkBorder rounded-lg bg-slate-50 dark:bg-slate-900 p-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 min-w-0"
                        >
                          {PIPELINE_STAGES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
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
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-100 dark:border-darkBorder/40 flex-shrink-0">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-slate-200 dark:border-darkBorder rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                Previous
              </button>
              <span className="text-xs text-slate-400 font-bold">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
