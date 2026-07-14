import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Filter,
  User,
  ExternalLink,
  ChevronRight,
  Plus,
  Loader2,
  SlidersHorizontal,
  ArrowRightLeft,
  XCircle,
  FileCheck,
  Trash2,
  Download,
  Copy,
  AlertTriangle
} from 'lucide-react';
const Candidates = () => {
  const { user } = useAuth();
  const canDelete = ['Admin', 'Recruiter'].includes(user?.role);
  const [deletingId, setDeletingId] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ minAiScore: 60 });
  
  // Filters — status can be pre-set via ?status= (e.g. from Dashboard KPI cards).
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(searchParams.get('status') || '');
  const [minScore, setMinScore] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedVerdict, setSelectedVerdict] = useState(''); // AI screening verdict (client-side)
  const [selectedLocation, setSelectedLocation] = useState(''); // current location (client-side)
  const [minSalary, setMinSalary] = useState(''); // salary-expectation range (client-side)
  const [maxSalary, setMaxSalary] = useState('');

  // UI state
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const jobsRes = await api.get('/jobs');
        if (jobsRes.data.success) {
          setJobs(jobsRes.data.data);
        }
        const settingsRes = await api.get('/settings');
        if (settingsRes.data.success) {
          setSettings(settingsRes.data.data);
        }
      } catch (err) {
        console.error('Error fetching jobs and settings in candidates directory', err);
      }
    };
    fetchData();
  }, []);

  const fetchCandidates = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (selectedJobId) queryParams.append('jobId', selectedJobId);
      if (selectedStatus) queryParams.append('status', selectedStatus);
      if (minScore) queryParams.append('minScore', minScore);
      if (selectedSkill) queryParams.append('skill', selectedSkill);

      const res = await api.get(`/candidates?${queryParams.toString()}`);
      if (res.data.success) {
        // Rank best-first by AI score; fall back to most-recent for ties.
        const ranked = [...res.data.data].sort((a, b) => {
          const diff = (b.aiAnalysis?.overallScore || 0) - (a.aiAnalysis?.overallScore || 0);
          if (diff !== 0) return diff;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        setCandidates(ranked);
      }
    } catch (err) {
      console.error('Error fetching candidates', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // While any candidate is still being analyzed, silently refresh so scores
  // appear as the background worker finishes.
  useEffect(() => {
    const anyPending = candidates.some((c) => ['pending', 'processing'].includes(c.analysisStatus));
    if (!anyPending) return undefined;
    const t = setTimeout(() => fetchCandidates(true), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  useEffect(() => {
    fetchCandidates();
  }, [search, selectedJobId, selectedStatus, minScore, selectedSkill]);

  const toggleSelectCandidate = (id) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCompareClick = () => {
    if (selectedCandidateIds.length < 2) return;
    navigate(`/compare?ids=${selectedCandidateIds.join(',')}`);
  };

  const handleClearSelection = () => {
    setSelectedCandidateIds([]);
  };

  const handleDelete = async (cand) => {
    if (
      !window.confirm(
        `Move ${cand.name} to Trash? You can restore them from Trash within 30 days, after which they're permanently deleted.`
      )
    )
      return;
    try {
      setDeletingId(cand._id);
      const res = await api.delete(`/candidates/${cand._id}`);
      if (res.data.success) {
        setCandidates((prev) => prev.filter((c) => c._id !== cand._id));
        setSelectedCandidateIds((prev) => prev.filter((i) => i !== cand._id));
      }
    } catch (err) {
      console.error('Error deleting candidate', err);
      window.alert(err.response?.data?.message || 'Failed to delete candidate.');
    } finally {
      setDeletingId(null);
    }
  };

  // Client-side AI verdict view filter (verdict lives in aiAnalysis jsonb).
  // Pull the first number out of a free-text salary expectation ("₹30,000 / month",
  // "30000-40000", "Negotiable" -> null) so it can be range-filtered.
  const parseSalary = (text) => {
    if (!text) return null;
    const m = String(text).replace(/[,\s]/g, '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  };

  // Distinct locations present in the fetched list (built from the full set so the
  // dropdown stays complete regardless of the location filter).
  const locations = [...new Set(candidates.map((c) => (c.currentLocation || '').trim()).filter(Boolean))].sort();

  // Client-side filters (verdict / location / salary all live on the candidate).
  const displayed = candidates.filter((c) => {
    if (selectedVerdict && (c.aiAnalysis?.screeningVerdict || '') !== selectedVerdict) return false;
    if (selectedLocation && (c.currentLocation || '').trim() !== selectedLocation) return false;
    if (minSalary || maxSalary) {
      const sal = parseSalary(c.salaryExpectation);
      if (sal == null) return false; // no numeric salary → excluded while filtering by salary
      if (minSalary && sal < parseInt(minSalary, 10)) return false;
      if (maxSalary && sal > parseInt(maxSalary, 10)) return false;
    }
    return true;
  });

  // Colour for the AI verdict badge.
  const verdictBadge = (v) => {
    switch (v) {
      case 'Strong Fit': return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
      case 'Potential Fit': return 'bg-brand-500/10 text-brand-600 border border-brand-500/20';
      case 'Weak Fit': return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
      case 'Not a Fit': return 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
      default: return '';
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
    if (score >= 60) return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
    return 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
  };

  // Export the currently filtered candidates to a CSV file (client-side).
  const exportCsv = () => {
    if (!displayed.length) return;
    const headers = ['Name', 'Email', 'Phone', 'Location', 'Salary Expectation', 'Target Role', 'Department', 'Status', 'AI Verdict', 'Overall Score', 'Match %', 'Skills', 'Applied'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = displayed.map((c) =>
      [
        c.name,
        c.email,
        c.phone || '',
        c.currentLocation || '',
        c.salaryExpectation || '',
        c.jobId?.title || '',
        c.jobId?.department || '',
        c.status,
        c.aiAnalysis?.screeningVerdict || '',
        c.aiAnalysis?.overallScore ?? '',
        c.aiAnalysis?.matchPercentage ?? '',
        (c.skills || []).join('; '),
        c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
      ]
        .map(esc)
        .join(',')
    );
    // Prepend a BOM so Excel reads UTF-8 correctly.
    const csv = '﻿' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300 relative pb-20">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Talent Profiles Directory</h2>
          <p className="text-xs text-slate-500">Search applicant profiles, evaluate AI scores, and initiate talent comparisons.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/trash"
            title="View deleted candidates (Trash)"
            className="flex items-center space-x-1.5 px-4 py-2.5 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            <Trash2 size={15} />
            <span>Trash</span>
          </Link>
          <button
            onClick={exportCsv}
            disabled={!candidates.length}
            title="Export the filtered candidates to CSV"
            className="flex items-center space-x-1.5 px-4 py-2.5 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>
          <Link
            to="/upload"
            className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/10 transition"
          >
            <Plus size={15} />
            <span>Upload & Parse CV</span>
          </Link>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 p-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark">
        {/* Search */}
        <div className="relative col-span-1 lg:col-span-2">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, skills, or experience..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        {/* Job opening */}
        <div>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All Job Openings</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>{j.title}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All Pipeline Stages</option>
            <option value="Applied">Applied</option>
            <option value="Screening">Screening</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Interview">Interview</option>
            <option value="Technical Round">Technical Round</option>
            <option value="HR Round">HR Round</option>
            <option value="Offer">Offer</option>
            <option value="Hired">Hired</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        {/* Score threshold */}
        <div>
          <select
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="">Min AI Score</option>
            {settings.minAiScore && (
              <option value={settings.minAiScore.toString()}>{settings.minAiScore}%+ (Recommended Threshold)</option>
            )}
            <option value="85">85%+ (Exceptional)</option>
            <option value="70">70+ (Strong)</option>
            <option value="50">50+ (Average)</option>
          </select>
        </div>

        {/* AI verdict */}
        <div>
          <select
            value={selectedVerdict}
            onChange={(e) => setSelectedVerdict(e.target.value)}
            className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All AI Verdicts</option>
            <option value="Strong Fit">Strong Fit</option>
            <option value="Potential Fit">Potential Fit</option>
            <option value="Weak Fit">Weak Fit</option>
            <option value="Not a Fit">Not a Fit</option>
          </select>
        </div>

        {/* Location */}
        <div>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            title="Filter by the candidate's current location"
            className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        {/* Salary expectation range */}
        <div className="flex items-center gap-1.5 lg:col-span-2" title="Filter by expected salary">
          <input
            type="number"
            min="0"
            value={minSalary}
            onChange={(e) => setMinSalary(e.target.value)}
            placeholder="Min salary"
            className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
          <span className="text-slate-300 dark:text-slate-600 text-xs">–</span>
          <input
            type="number"
            min="0"
            value={maxSalary}
            onChange={(e) => setMaxSalary(e.target.value)}
            placeholder="Max salary"
            className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>

      {/* Main Table View */}
      {loading ? (
        <div className="p-4 space-y-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <User className="text-slate-300 dark:text-slate-700 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Candidates Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
            Try clearing search queries, adjusting filters, or upload resumes directly.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-darkBorder/60 bg-slate-50/50 dark:bg-slate-900/30 text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <th className="py-2.5 px-4 w-12 text-center hidden md:table-cell">Select</th>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Target Role</th>
                  <th className="py-2.5 px-4 hidden md:table-cell">Pipeline Stage</th>
                  <th className="py-2.5 px-4 text-center">Overall Score</th>
                  <th className="py-2.5 px-4 hidden md:table-cell">Apply Date</th>
                  <th className="py-2.5 px-4 w-20 hidden md:table-cell"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/60 text-xs">
                {displayed.map((cand) => (
                  <tr
                    key={cand._id}
                    className={`hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-all ${
                      selectedCandidateIds.includes(cand._id) ? 'bg-brand-500/5 dark:bg-brand-500/10' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-2.5 px-4 text-center hidden md:table-cell">
                      <input
                        type="checkbox"
                        checked={selectedCandidateIds.includes(cand._id)}
                        onChange={() => toggleSelectCandidate(cand._id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20 w-4 h-4 cursor-pointer"
                      />
                    </td>

                    {/* Candidate Identity */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                          {cand.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/candidates/${cand._id}`}
                              className="font-bold text-slate-800 dark:text-slate-200 hover:text-brand-500 dark:hover:text-brand-400 hover:underline"
                            >
                              {cand.name}
                            </Link>
                            {cand.isDuplicate && (
                              <span
                                title={`Duplicate — this person has ${cand.duplicateCount} applications for this same job`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[8.5px] font-bold uppercase"
                              >
                                <Copy size={9} /> Dup
                              </span>
                            )}
                            {cand.otherApplications?.length > 0 && (
                              <span
                                title={`Also applied for: ${cand.otherApplications.map((o) => o.title).join(', ')}`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 border border-brand-500/20 text-[8.5px] font-bold"
                              >
                                <ArrowRightLeft size={9} />
                                {cand.otherApplications.length === 1
                                  ? `Applied for: ${cand.otherApplications[0].title}`
                                  : `+${cand.otherApplications.length} roles`}
                              </span>
                            )}
                            {cand.aiAnalysis?.redFlags?.length > 0 && (
                              <span
                                title={`${cand.aiAnalysis.redFlags.length} AI red flag(s): ${cand.aiAnalysis.redFlags.map((f) => f.type).join(', ')}`}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[8.5px] font-bold"
                              >
                                <AlertTriangle size={9} /> {cand.aiAnalysis.redFlags.length}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {!cand.email?.endsWith('@pending.local') && (
                              <span className="text-[10px] text-slate-400">{cand.email}</span>
                            )}
                            {['pending', 'processing'].includes(cand.analysisStatus) ? (
                              <span className="inline-flex items-center gap-1 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 border border-brand-500/20">
                                <Loader2 size={9} className="animate-spin" /> Analyzing
                              </span>
                            ) : cand.analysisStatus === 'failed' ? (
                              <span title={cand.analysisError} className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                <AlertTriangle size={9} /> Analysis failed
                              </span>
                            ) : cand.aiAnalysis?.screeningVerdict && (
                              <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${verdictBadge(cand.aiAnalysis.screeningVerdict)}`}>
                                {cand.aiAnalysis.screeningVerdict}
                              </span>
                            )}
                            {cand.quizResult?.score != null && (
                              <span title="Screening quiz score" className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                Quiz {cand.quizResult.score}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Target Job */}
                    <td className="py-2.5 px-4 font-medium text-slate-600 dark:text-slate-300">
                      {cand.jobId?.title || 'Unknown Opening'}
                      <span className="text-[10px] text-slate-400 block">{cand.jobId?.department}</span>
                    </td>

                    {/* Pipeline Status */}
                    <td className="py-2.5 px-4 hidden md:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-[9px] uppercase ${
                        cand.status === 'Hired' ? 'bg-emerald-500/10 text-emerald-600' :
                        cand.status === 'Rejected' ? 'bg-rose-500/10 text-rose-600' :
                        cand.status === 'Shortlisted' ? 'bg-brand-500/10 text-brand-600' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {cand.status}
                      </span>
                    </td>

                    {/* AI Score */}
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${getScoreColor(cand.aiAnalysis?.overallScore || 0)}`}>
                        {cand.aiAnalysis?.overallScore || 0}%
                      </span>
                    </td>

                    {/* Apply date */}
                    <td className="py-2.5 px-4 text-slate-400 dark:text-slate-500 hidden md:table-cell">
                      {new Date(cand.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>

                    {/* Row actions */}
                    <td className="py-2.5 px-4 hidden md:table-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(cand)}
                            disabled={deletingId === cand._id}
                            title="Delete candidate & resume"
                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition disabled:opacity-50"
                          >
                            {deletingId === cand._id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        )}
                        <Link
                          to={`/candidates/${cand._id}`}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating Talents Compare Panel */}
      {selectedCandidateIds.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-slate-950 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center space-x-6 z-40 border border-slate-800/80 animate-in slide-in-from-bottom-6 duration-200">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-[10px] font-bold">
              {selectedCandidateIds.length}
            </div>
            <span className="text-xs font-semibold">Talents Selected for Comparison</span>
          </div>
          
          <div className="flex items-center space-x-2.5">
            <button
              onClick={handleClearSelection}
              className="p-1 text-slate-400 hover:text-slate-300 rounded"
              title="Clear Selections"
            >
              <XCircle size={15} />
            </button>
            <div className="w-[1px] h-4 bg-slate-700" />
            <button
              onClick={handleCompareClick}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold rounded-xl shadow transition"
            >
              <ArrowRightLeft size={13} />
              <span>Compare Matrices</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Candidates;
