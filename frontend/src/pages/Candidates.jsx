import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { coordsFor, haversineKm } from '../data/cities';
import {
  Search,
  Filter,
  User,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Plus,
  Loader2,
  SlidersHorizontal,
  ArrowRightLeft,
  XCircle,
  FileCheck,
  Trash2,
  Download,
  Copy,
  AlertTriangle,
  UserPlus,
  MapPin
} from 'lucide-react';

const PAGE_SIZE = 25; // server-side page size for the candidate list

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
  const [selectedVerdict, setSelectedVerdict] = useState(''); // AI screening verdict (server-side)
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0); // total matches across all pages (from server)
  const [distanceSort, setDistanceSort] = useState(''); // '' | 'nearest' | 'farthest'
  const [salarySort, setSalarySort] = useState('');     // '' | 'high' | 'low'
  const [showFilters, setShowFilters] = useState(false);

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
      if (selectedVerdict) queryParams.append('verdict', selectedVerdict);
      queryParams.append('page', String(page));
      queryParams.append('pageSize', String(PAGE_SIZE));

      const res = await api.get(`/candidates?${queryParams.toString()}`);
      if (res.data.success) {
        // The server already returns this page ordered best-first (highest AI
        // score). No client-side re-sort — that would only reorder within a page.
        setCandidates(res.data.data);
        setTotal(res.data.total ?? res.data.data.length);
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

  // Any filter change resets to page 1 (so you don't land on an out-of-range page).
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedJobId, selectedStatus, minScore, selectedSkill, selectedVerdict]);

  // Fetch whenever the page or any (server-side) filter changes.
  useEffect(() => {
    fetchCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, selectedJobId, selectedStatus, minScore, selectedSkill, selectedVerdict]);

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

  // Verdict filtering is now applied server-side (see fetchCandidates). The
  // distance/salary sorts below still operate on the current page only.
  const displayed = candidates;

  // Sorting. "Nearest" measures each candidate's location against the SELECTED
  // job's location (needs a job selected + known coordinates on both sides).
  const refCoords = coordsFor(jobs.find((j) => j._id === selectedJobId)?.location);
  const withMeta = displayed.map((c) => {
    const cc = coordsFor(c.currentLocation);
    return {
      ...c,
      distanceKm: refCoords && cc ? haversineKm(refCoords, cc) : null,
      salaryNum: parseSalary(c.salaryExpectation),
    };
  });
  const nullsLast = (a, b, key, dir) => {
    if (a[key] == null && b[key] == null) return 0;
    if (a[key] == null) return 1; // unknown → always last
    if (b[key] == null) return -1;
    return dir === 'asc' ? a[key] - b[key] : b[key] - a[key];
  };
  const sorted = [...withMeta];
  if (distanceSort === 'nearest') sorted.sort((a, b) => nullsLast(a, b, 'distanceKm', 'asc'));
  else if (distanceSort === 'farthest') sorted.sort((a, b) => nullsLast(a, b, 'distanceKm', 'desc'));
  else if (salarySort === 'high') sorted.sort((a, b) => nullsLast(a, b, 'salaryNum', 'desc'));
  else if (salarySort === 'low') sorted.sort((a, b) => nullsLast(a, b, 'salaryNum', 'asc'));

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

  const [exporting, setExporting] = useState(false);

  // Export ALL rows matching the current filters (not just the visible page).
  // Pulls up to 500 from the server so export isn't limited to one page.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const qp = new URLSearchParams();
      if (search) qp.append('search', search);
      if (selectedJobId) qp.append('jobId', selectedJobId);
      if (selectedStatus) qp.append('status', selectedStatus);
      if (minScore) qp.append('minScore', minScore);
      if (selectedSkill) qp.append('skill', selectedSkill);
      if (selectedVerdict) qp.append('verdict', selectedVerdict);
      qp.append('page', '1');
      qp.append('pageSize', '500');
      const res = await api.get(`/candidates?${qp.toString()}`);
      const all = res.data?.data || [];
      if (!all.length) return;
      if ((res.data?.total ?? all.length) > all.length) {
        alert(`Exporting the first ${all.length} of ${res.data.total} matches. Narrow the filters to export a smaller, complete set.`);
      }
      exportRowsToCsv(all);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const exportRowsToCsv = (list) => {
    const headers = ['Name', 'Email', 'Phone', 'Location', 'Salary Expectation', 'Target Role', 'Department', 'Status', 'AI Verdict', 'Overall Score', 'Match %', 'Skills', 'Applied'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = list.map((c) =>
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
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          <Link
            to="/trash"
            title="View deleted candidates (Trash)"
            className="flex items-center justify-center space-x-1.5 px-4 py-2.5 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition w-full sm:w-auto"
          >
            <Trash2 size={15} />
            <span>Trash</span>
          </Link>
          <button
            onClick={exportCsv}
            disabled={!candidates.length || exporting}
            title="Export all candidates matching the current filters to CSV"
            className="flex items-center justify-center space-x-1.5 px-4 py-2.5 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50 w-full sm:w-auto"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>
          <Link
            to="/candidates/new"
            title="Add a candidate without a résumé"
            className="flex items-center justify-center space-x-1.5 px-4 py-2.5 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition w-full sm:w-auto"
          >
            <UserPlus size={15} />
            <span>Add Manually</span>
          </Link>
          <Link
            to="/upload"
            className="flex items-center justify-center space-x-1.5 px-4.5 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/10 transition w-full sm:w-auto"
          >
            <Plus size={15} />
            <span>Upload & Parse CV</span>
          </Link>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-4 shadow-premium dark:shadow-premium-dark space-y-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, skills, or experience..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          {/* Toggle Button for Mobile */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`lg:hidden flex items-center justify-center w-10 h-10 border border-slate-200 dark:border-darkBorder rounded-xl text-slate-600 dark:text-slate-400 focus:outline-none transition-all ${showFilters ? 'bg-[#c5a880]/15 border-[#c5a880] text-[#c5a880]' : 'bg-white dark:bg-slate-900'}`}
            title="Toggle Advanced Filters"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        {/* Advanced Filters: Collapsible on mobile */}
        <div className={`${showFilters ? 'grid animate-in fade-in slide-in-from-top-2 duration-200' : 'hidden'} lg:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 w-full`}>
          {/* Job opening */}
          <div>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
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
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
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
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
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
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">All AI Verdicts</option>
              <option value="Strong Fit">Strong Fit</option>
              <option value="Potential Fit">Potential Fit</option>
              <option value="Weak Fit">Weak Fit</option>
              <option value="Not a Fit">Not a Fit</option>
            </select>
          </div>

          {/* Distance sort (relative to the selected job's location) */}
          <div>
            <select
              value={distanceSort}
              onChange={(e) => { setDistanceSort(e.target.value); if (e.target.value) setSalarySort(''); }}
              title={!selectedJobId ? 'Select a job opening to sort by distance from its location' : 'Sort by distance from the selected job'}
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">Distance</option>
              <option value="nearest">Nearest first</option>
              <option value="farthest">Farthest first</option>
            </select>
          </div>

          {/* Salary sort */}
          <div>
            <select
              value={salarySort}
              onChange={(e) => { setSalarySort(e.target.value); if (e.target.value) setDistanceSort(''); }}
              title="Sort by salary expectation"
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">Salary</option>
              <option value="high">Salary: High → Low</option>
              <option value="low">Salary: Low → High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      {loading ? (
        <div className="p-4 space-y-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <User className="text-slate-300 dark:text-slate-700 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Candidates Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
            Try clearing search queries, adjusting filters, or upload resumes directly.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop View */}
          <div className="hidden md:block bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark overflow-hidden">
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
                {sorted.map((cand) => (
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
                            {distanceSort && cand.distanceKm != null && (
                              <span
                                title={`~${cand.distanceKm} km from the selected job's location`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[8.5px] font-bold"
                              >
                                <MapPin size={9} /> {cand.distanceKm} km
                              </span>
                            )}
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
                            ) : cand.analysisStatus === 'rejected' ? (
                              <span title={cand.analysisError} className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                <AlertTriangle size={9} /> Rejected
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

          {/* Mobile View: Vertical card stack */}
          <div className="md:hidden space-y-3.5">
            {sorted.map((cand) => {
              const isSelected = selectedCandidateIds.includes(cand._id);
              return (
                <div 
                  key={cand._id} 
                  className={`p-4 bg-white dark:bg-darkCard border rounded-xl shadow-sm transition-all flex flex-col gap-3 ${
                    isSelected ? 'border-brand-600 bg-brand-500/5 dark:bg-brand-500/10' : 'border-slate-200 dark:border-darkBorder'
                  }`}
                >
                  {/* Header: Checkbox + Name + AI Score */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectCandidate(cand._id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20 w-4 h-4 cursor-pointer"
                      />
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400 text-xs shrink-0">
                        {cand.name.charAt(0)}
                      </div>
                      <div>
                        <Link
                          to={`/candidates/${cand._id}`}
                          className="font-bold text-slate-800 dark:text-slate-200 hover:text-brand-500 hover:underline text-xs"
                        >
                          {cand.name}
                        </Link>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {distanceSort && cand.distanceKm != null && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[8px] font-bold">
                              <MapPin size={9} /> {cand.distanceKm} km
                            </span>
                          )}
                          {cand.isDuplicate && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[8px] font-bold uppercase">
                              <Copy size={9} /> Dup
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* AI Score Badge */}
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${getScoreColor(cand.aiAnalysis?.overallScore || 0)}`}>
                      {cand.aiAnalysis?.overallScore || 0}%
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 dark:text-slate-400 border-t border-b border-slate-100 dark:border-darkBorder/40 py-2.5">
                    <div>
                      <span className="text-slate-400 block uppercase tracking-wider text-[8px] mb-0.5">Target Role</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block text-[10px]">
                        {cand.jobId?.title || 'Unknown Opening'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase tracking-wider text-[8px] mb-0.5">Pipeline Stage</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-[8px] uppercase mt-0.5 ${
                        cand.status === 'Hired' ? 'bg-emerald-500/10 text-emerald-600' :
                        cand.status === 'Rejected' ? 'bg-rose-500/10 text-rose-600' :
                        cand.status === 'Shortlisted' ? 'bg-brand-500/10 text-brand-600' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {cand.status}
                      </span>
                    </div>
                  </div>

                  {/* Footer: Verdict Badges & Actions */}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cand.aiAnalysis?.screeningVerdict && (
                        <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${verdictBadge(cand.aiAnalysis.screeningVerdict)}`}>
                          {cand.aiAnalysis.screeningVerdict}
                        </span>
                      )}
                      {cand.quizResult?.score != null && (
                        <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          Quiz {cand.quizResult.score}%
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(cand)}
                          disabled={deletingId === cand._id}
                          className="p-1.5 border border-slate-200 dark:border-darkBorder hover:border-rose-500/20 hover:text-rose-500 hover:bg-rose-500/5 text-slate-400 rounded-lg transition disabled:opacity-50"
                          title="Delete Candidate"
                        >
                          {deletingId === cand._id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      )}
                      <Link
                        to={`/candidates/${cand._id}`}
                        className="p-1.5 border border-slate-200 dark:border-darkBorder hover:border-brand-500/20 hover:text-brand-500 hover:bg-brand-500/5 text-slate-400 rounded-lg transition"
                      >
                        <ChevronRight size={13} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination — server-side; page 1 is the highest-scoring candidates. */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1 pt-1">
          <span className="text-[11px] text-slate-400">
            Showing <strong className="text-slate-600 dark:text-slate-300">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</strong> of{' '}
            <strong className="text-slate-600 dark:text-slate-300">{total}</strong> candidate{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:text-brand-500 transition"
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <span className="text-[11px] text-slate-500 px-1">Page {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:text-brand-500 transition"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Talents Compare Panel */}
      {selectedCandidateIds.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] sm:w-auto max-w-md bg-slate-900 dark:bg-slate-950 text-white px-4 sm:px-5 py-3 rounded-2xl shadow-xl flex items-center justify-between sm:space-x-6 z-40 border border-slate-800/80 animate-in slide-in-from-bottom-6 duration-200">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {selectedCandidateIds.length}
            </div>
            <span className="text-[11px] sm:text-xs font-semibold truncate max-w-[150px] sm:max-w-none">
              Selected for Comparison
            </span>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-2.5 flex-shrink-0">
            <button
              onClick={handleClearSelection}
              className="p-1 text-slate-400 hover:text-slate-350 rounded cursor-pointer"
              title="Clear Selections"
            >
              <XCircle size={15} />
            </button>
            <div className="w-[1px] h-4 bg-slate-700" />
            <button
              onClick={handleCompareClick}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-[10px] sm:text-xs font-semibold rounded-xl shadow transition cursor-pointer"
            >
              <ArrowRightLeft size={12} />
              <span>Compare</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Candidates;
