import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  ChevronLeft,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileCheck,
  Zap,
  TrendingDown,
  Building,
  GraduationCap,
  Search
} from 'lucide-react';

const Compare = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allCandidates, setAllCandidates] = useState([]);
  const [pick, setPick] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterJobId, setFilterJobId] = useState('');
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState('');

  const selectedIds = (searchParams.get('ids') || '').split(',').filter(Boolean);

  // Load all candidates once (used both for the comparison and the picker).
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const res = await api.get('/candidates');
        if (res.data.success) setAllCandidates(res.data.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load candidates.');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Keep the picker pre-checked with whatever came in via the URL.
  useEffect(() => {
    setPick((searchParams.get('ids') || '').split(',').filter(Boolean));
  }, [searchParams]);

  const candidates = allCandidates.filter((c) => selectedIds.includes(c._id));
  const showMatrix = selectedIds.length >= 2 && candidates.length >= 2;

  const togglePick = (id) =>
    setPick((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const applyCompare = () => {
    if (pick.length >= 2) setSearchParams({ ids: pick.join(',') });
  };

  // Unique list of applied posts (jobs) among the loaded candidates.
  const jobOptions = Array.from(
    new Map(
      allCandidates.filter((c) => c.jobId && c.jobId._id).map((c) => [c.jobId._id, c.jobId])
    ).values()
  );

  const visibleCandidates = allCandidates
    .filter((c) => {
      if (filterJobId && c.jobId?._id !== filterJobId) return false;
      if (search && !c.name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (minScore && (c.aiAnalysis?.overallScore || 0) < Number(minScore)) return false;
      return true;
    })
    // Rank highest match first so the best candidates surface for comparison.
    .sort((a, b) => (b.aiAnalysis?.overallScore || 0) - (a.aiAnalysis?.overallScore || 0));

  if (loading) {
    return <CompareSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <AlertCircle className="text-rose-500 mb-3" size={32} />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{error}</h3>
        <Link to="/candidates" className="text-xs text-brand-500 mt-2 hover:underline flex items-center">
          <ChevronLeft size={14} className="mr-1" /> Back to candidates
        </Link>
      </div>
    );
  }

  // Fewer than two valid selections -> show an inline picker so this page works
  // on its own (e.g. reached via the "Compare Talents" sidebar link).
  if (!showMatrix) {
    return (
      <div className="space-y-3 animate-in fade-in duration-300">
        <div className="flex items-center space-x-3.5 pb-2.5 border-b border-slate-200 dark:border-darkBorder">
          <Link
            to="/candidates"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition"
          >
            <ChevronLeft size={16} />
          </Link>
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Talent Comparison Matrix</h2>
            <p className="text-xs text-slate-500">Pick at least two candidates to compare side by side.</p>
          </div>
        </div>

        {allCandidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
            <Users className="text-slate-300 dark:text-slate-700 mb-3" size={40} />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No candidates yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
              Upload and analyze resumes first, then come back to compare applicants.
            </p>
            <Link to="/candidates" className="mt-3 text-xs font-semibold text-brand-500 hover:underline">
              Go to Candidates
            </Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-darkBorder/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                Select candidates ({pick.length} chosen)
              </span>
              <button
                onClick={applyCompare}
                disabled={pick.length < 2}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition"
              >
                <span>Compare{pick.length >= 2 ? ` (${pick.length})` : ''}</span>
              </button>
            </div>

            {/* Filter bar: applied post + name search */}
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-darkBorder/60 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full h-9 pl-9 pr-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <select
                value={filterJobId}
                onChange={(e) => setFilterJobId(e.target.value)}
                className="h-9 px-3 min-w-0 sm:w-48 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 truncate focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="">All Applied Posts</option>
                {jobOptions.map((j) => (
                  <option key={j._id} value={j._id}>{j.title}</option>
                ))}
              </select>
              <select
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="h-9 px-3 min-w-0 sm:w-36 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="">All Scores</option>
                <option value="85">85%+ (Exceptional)</option>
                <option value="70">70%+ (Strong)</option>
                <option value="50">50%+ (Average)</option>
              </select>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-darkBorder/60 max-h-[56vh] overflow-y-auto">
              {visibleCandidates.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">No candidates match this filter.</div>
              ) : (
                visibleCandidates.map((c) => (
                  <label
                    key={c._id}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                  >
                    <input
                      type="checkbox"
                      checked={pick.includes(c._id)}
                      onChange={() => togglePick(c._id)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20"
                    />
                    <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                      {c.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-400">{c.jobId?.title || 'Unknown role'}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">{c.aiAnalysis?.overallScore || 0}%</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center space-x-3.5 pb-2.5 border-b border-slate-200 dark:border-darkBorder">
        <Link
          to="/candidates"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition"
        >
          <ChevronLeft size={16} />
        </Link>
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Talent Comparison Matrix</h2>
          <p className="text-xs text-slate-500">Side-by-side comparison of candidate profiles and AI score diagnostics.</p>
        </div>
        <button
          onClick={() => setSearchParams({})}
          className="ml-auto px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
        >
          Change selection
        </button>
      </div>

      {/* Comparison Grid */}
      <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed text-left text-xs min-w-[700px]">
            
            {/* Header row with candidate names */}
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkBorder/60 bg-slate-50/50 dark:bg-slate-900/30">
                <th className="py-3 px-4 font-bold text-slate-400 uppercase tracking-widest text-[10px] w-64 border-r border-slate-200/40 dark:border-darkBorder/20">
                  Assessment Field
                </th>
                {candidates.map((cand) => (
                  <th key={cand._id} className="py-3 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0">
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm line-clamp-1">{cand.name}</h4>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block line-clamp-1">{cand.jobId?.title || 'Job Target'}</span>
                      <Link to={`/candidates/${cand._id}`} className="inline-block text-[10px] font-bold text-brand-500 hover:underline">
                        Review Full Profile
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Matrix comparison body */}
            <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/60">
              
              {/* Overall AI Score */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Overall Score
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 font-bold text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-lg ${
                      (cand.aiAnalysis?.overallScore || 0) >= 80 ? 'bg-emerald-500/10 text-emerald-600' :
                      (cand.aiAnalysis?.overallScore || 0) >= 60 ? 'bg-amber-500/10 text-amber-600' :
                      'bg-rose-500/10 text-rose-600'
                    }`}>
                      {cand.aiAnalysis?.overallScore || 0}%
                    </span>
                  </td>
                ))}
              </tr>

              {/* Recommendation */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                   Recommendation
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 font-semibold text-slate-700 dark:text-slate-300">
                    {cand.aiAnalysis?.recommendation || 'Proceed to Screening'}
                  </td>
                ))}
              </tr>

              {/* Technical Capability */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Technical Score
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 font-medium">
                    {cand.aiAnalysis?.technicalScore}%
                  </td>
                ))}
              </tr>

              {/* Experience Alignment */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Experience Score
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 font-medium">
                    {cand.aiAnalysis?.experienceScore}%
                  </td>
                ))}
              </tr>

              {/* Culture Fit Alignment */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Culture Fit Score
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 font-medium">
                    {cand.aiAnalysis?.cultureFitScore}%
                  </td>
                ))}
              </tr>

              {/* Matched Skills */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Matching Skills
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0">
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {cand.aiAnalysis?.matchedSkills?.map((skill, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9.5px]">
                          {skill}
                        </span>
                      ))}
                      {(!cand.aiAnalysis?.matchedSkills || cand.aiAnalysis.matchedSkills.length === 0) && (
                        <span className="text-[10px] text-slate-400 italic">No matches.</span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Missing Skills */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Missing Skills
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0">
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {cand.aiAnalysis?.missingSkills?.map((skill, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-rose-500/10 text-rose-600 rounded text-[9.5px]">
                          {skill}
                        </span>
                      ))}
                      {(!cand.aiAnalysis?.missingSkills || cand.aiAnalysis.missingSkills.length === 0) && (
                        <span className="text-[10px] text-slate-400 italic">None missing!</span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Strengths */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Strengths
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 text-slate-500 dark:text-slate-400 leading-normal">
                    <ul className="list-disc pl-4 space-y-1">
                      {cand.aiAnalysis?.strengths?.map((str, idx) => (
                        <li key={idx}>{str}</li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>

              {/* Weaknesses */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Weaknesses
                </td>
                {candidates.map((cand) => (
                  <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 text-slate-500 dark:text-slate-400 leading-normal">
                    <ul className="list-disc pl-4 space-y-1">
                      {cand.aiAnalysis?.weaknesses?.map((weak, idx) => (
                        <li key={idx}>{weak}</li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>

              {/* Work tenure summary */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Last Employment
                </td>
                {candidates.map((cand) => {
                  const lastJob = cand.experience?.[0];
                  return (
                    <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 text-slate-600 dark:text-slate-300">
                      {lastJob ? (
                        <div className="space-y-0.5">
                          <span className="font-bold block">{lastJob.title}</span>
                          <span className="text-[10px] text-slate-400">{lastJob.company} ({lastJob.startDate} - {lastJob.endDate})</span>
                        </div>
                      ) : (
                        <span className="italic text-slate-400">None parsed.</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Academic Level */}
              <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200/40 dark:border-darkBorder/20 bg-slate-50/20 dark:bg-slate-900/10">
                  Academic Credentials
                </td>
                {candidates.map((cand) => {
                  const lastEdu = cand.education?.[0];
                  return (
                    <td key={cand._id} className="py-2.5 px-4 border-r border-slate-200/40 dark:border-darkBorder/20 last:border-r-0 text-slate-600 dark:text-slate-300">
                      {lastEdu ? (
                        <div className="space-y-0.5">
                          <span className="font-bold block">{lastEdu.degree}</span>
                          <span className="text-[10px] text-slate-400">{lastEdu.school} ({lastEdu.startYear} - {lastEdu.endYear})</span>
                        </div>
                      ) : (
                        <span className="italic text-slate-400">None parsed.</span>
                      )}
                    </td>
                  );
                })}
              </tr>

            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

// Skeletons
const CompareSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    <div className="h-[500px] bg-slate-200 dark:bg-slate-800 rounded-2xl" />
  </div>
);

export default Compare;
