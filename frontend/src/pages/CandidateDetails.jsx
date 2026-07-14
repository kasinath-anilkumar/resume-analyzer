import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api, { API_ORIGIN } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Mail,
  Phone,
  Github,
  Linkedin,
  Globe,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Building,
  GraduationCap,
  FolderGit2,
  ExternalLink,
  Trash2,
  Send,
  Loader2,
  ChevronLeft,
  Plus,
  RefreshCw,
  Printer,
  ArrowRightLeft,
  CalendarPlus,
  Clock,
  X,
  Sparkles,
  AlertTriangle,
  MessageSquare,
  Award,
  Gauge,
  ClipboardList
} from 'lucide-react';

// Dynamic score coloring: green (strong) / amber (moderate) / red (weak).
const scoreText = (v = 0) =>
  v >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : v >= 60 ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';
const scoreBar = (v = 0) =>
  v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-rose-500';
const scoreBox = (v = 0) =>
  v >= 80 ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40'
    : v >= 60 ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40'
      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40';

// Colour the screening verdict badge.
const verdictClass = (v) => {
  switch (v) {
    case 'Strong Fit': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400';
    case 'Potential Fit': return 'bg-brand-500/10 border-brand-500/20 text-brand-600 dark:text-brand-400';
    case 'Weak Fit': return 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400';
    default: return 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400';
  }
};

// Small labelled metric tile for the AI insights row.
const InsightTile = ({ icon: Icon, label, value }) => (
  <div className="p-2.5 bg-slate-50/60 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/30 rounded-xl">
    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
      <Icon size={11} /> {label}
    </div>
    <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1 truncate">{value}</div>
  </div>
);

const CandidateDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canManage = ['Admin', 'Recruiter'].includes(user?.role);
  const canDelete = canManage;

  // Recruiter Notes state
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Manage actions (move job / re-analyze) + interviews
  const [jobs, setJobs] = useState([]);
  const [moving, setMoving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [actionMsg, setActionMsg] = useState({ type: '', text: '' });
  const emptyInterview = { stage: 'Interview', scheduledAt: '', mode: 'Online', locationOrLink: '', interviewer: '', notes: '', notifyCandidate: false };
  const [interviewForm, setInterviewForm] = useState(emptyInterview);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [savingInterview, setSavingInterview] = useState(false);

  const flash = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: '', text: '' }), 5000);
  };

  const fetchCandidate = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get(`/candidates/${id}`);
      if (res.data.success) {
        setCandidate(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Could not retrieve candidate details.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidate();
  }, [id]);

  // Poll while the background worker is still analyzing this candidate.
  useEffect(() => {
    if (!candidate || !['pending', 'processing'].includes(candidate.analysisStatus)) return undefined;
    const t = setTimeout(() => fetchCandidate(true), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate]);

  // Load active jobs for the "move to job" control (HR only).
  useEffect(() => {
    if (!canManage) return;
    api.get('/jobs')
      .then((res) => { if (res.data.success) setJobs(res.data.data); })
      .catch((err) => console.error('Failed to load jobs', err));
  }, [canManage]);

  const handleReanalyze = async () => {
    if (!window.confirm('Re-download the resume and re-run AI analysis against the current job? This overwrites the existing scores.')) return;
    setReanalyzing(true);
    setActionMsg({ type: '', text: '' });
    try {
      const res = await api.post(`/candidates/${id}/reanalyze`);
      if (res.data.success) {
        setCandidate((prev) => ({ ...res.data.data, duplicates: prev.duplicates }));
        flash('success', 'Candidate re-analyzed against the current job.');
      } else {
        flash('error', res.data.message || 'Re-analysis failed.');
      }
    } catch (err) {
      flash('error', err.response?.data?.message || 'Re-analysis failed.');
    } finally {
      setReanalyzing(false);
    }
  };

  const handleMoveJob = async (jobId) => {
    if (!jobId || jobId === candidate.jobId?._id) return;
    const target = jobs.find((j) => j._id === jobId);
    if (!window.confirm(`Move ${candidate.name} to "${target?.title}"? AI scores were computed for the current job — re-run analysis afterwards for accurate matching.`)) return;
    setMoving(true);
    try {
      const res = await api.put(`/candidates/${id}/job`, { jobId });
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, jobId: res.data.data.jobId }));
        flash('success', res.data.message || 'Candidate moved.');
      } else {
        flash('error', res.data.message || 'Move failed.');
      }
    } catch (err) {
      flash('error', err.response?.data?.message || 'Move failed.');
    } finally {
      setMoving(false);
    }
  };

  const handleScheduleInterview = async (e) => {
    e.preventDefault();
    if (!interviewForm.scheduledAt) return;
    setSavingInterview(true);
    try {
      const res = await api.post(`/candidates/${id}/interviews`, interviewForm);
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, interviews: res.data.data }));
        setInterviewForm(emptyInterview);
        setShowInterviewForm(false);
        flash('success', res.data.emailed ? 'Interview scheduled and candidate emailed.' : 'Interview scheduled.');
      }
    } catch (err) {
      flash('error', err.response?.data?.message || 'Failed to schedule interview.');
    } finally {
      setSavingInterview(false);
    }
  };

  const handleDeleteInterview = async (interviewId) => {
    if (!window.confirm('Remove this scheduled interview?')) return;
    try {
      const res = await api.delete(`/candidates/${id}/interviews/${interviewId}`);
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, interviews: res.data.data }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrint = () => window.print();

  // GDPR: download everything held for this candidate as JSON.
  const handleExport = async () => {
    try {
      const res = await api.get(`/candidates/${id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `candidate-${(candidate?.name || 'export').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      flash('error', 'Could not export candidate data.');
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setAddingNote(true);
    try {
      const res = await api.post(`/candidates/${id}/notes`, { note: newNote });
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, notes: res.data.data }));
        setNewNote('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this evaluation note?')) return;
    try {
      const res = await api.delete(`/candidates/${id}/notes/${noteId}`);
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, notes: res.data.data }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCandidate = async () => {
    if (
      !window.confirm(
        `Delete ${candidate.name}? This permanently removes the candidate, their AI analysis, notes and the stored resume file. This cannot be undone.`
      )
    )
      return;
    try {
      setDeleting(true);
      const res = await api.delete(`/candidates/${id}`);
      if (res.data.success) {
        navigate('/candidates');
      }
    } catch (err) {
      console.error(err);
      window.alert(err.response?.data?.message || 'Failed to delete candidate.');
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await api.put(`/candidates/${id}/status`, { status: newStatus });
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, status: res.data.data.status }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <DetailsSkeleton />;
  }

  if (error || !candidate) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <AlertCircle className="text-rose-500 mb-3" size={32} />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{error || 'Candidate profile not found'}</h3>
        <Link to="/candidates" className="text-xs text-brand-500 mt-2 hover:underline flex items-center">
          <ChevronLeft size={14} className="mr-1" /> Back to candidates
        </Link>
      </div>
    );
  }

  const { aiAnalysis } = candidate;

  const scoreCategories = [
    { label: 'Technical Ability', value: aiAnalysis?.technicalScore, expl: aiAnalysis?.explanations?.technical },
    { label: 'Experience Depth', value: aiAnalysis?.experienceScore, expl: aiAnalysis?.explanations?.experience },
    { label: 'Academic Match', value: aiAnalysis?.educationScore, expl: aiAnalysis?.explanations?.education },
    { label: 'Communication Skill', value: aiAnalysis?.communicationScore, expl: aiAnalysis?.explanations?.communication },
    { label: 'Organization Culture Fit', value: aiAnalysis?.cultureFitScore, expl: aiAnalysis?.explanations?.cultureFit },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      
      {/* Back & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2.5 border-b border-slate-200 dark:border-darkBorder">
        <div className="flex items-center space-x-3.5">
          <Link
            to="/candidates"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition"
          >
            <ChevronLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{candidate.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                candidate.aiAnalysis?.overallScore >= 80 ? 'bg-emerald-500/10 text-emerald-600' :
                candidate.aiAnalysis?.overallScore >= 60 ? 'bg-amber-500/10 text-amber-600' :
                'bg-rose-500/10 text-rose-600'
              }`}>
                Job Match: {candidate.aiAnalysis?.overallScore}%
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
              <span>Candidate for <strong className="text-slate-700 dark:text-slate-300">{candidate.jobId?.title}</strong> ({candidate.jobId?.department})</span>
              {candidate.source === 'Application' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase tracking-wide">
                  Applied via Careers
                </span>
              )}
              {candidate.consentAt && (
                <span title={`Consent given: ${new Date(candidate.consentAt).toLocaleString()}`} className="text-[9px] text-slate-400">
                  ✓ Consented {new Date(candidate.consentAt).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Change Stage dropdown */}
        <div className="flex items-center space-x-3">
          {candidate.resumeUrl && (
            <a
              href={/^https?:\/\//.test(candidate.resumeUrl) ? candidate.resumeUrl : `${API_ORIGIN}${candidate.resumeUrl}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-4 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              <FileText size={14} />
              <span>Download CV</span>
            </a>
          )}
          
          <select
            value={candidate.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
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

          {canDelete && (
            <button
              onClick={handleDeleteCandidate}
              disabled={deleting}
              title="Delete candidate & resume"
              className="flex items-center space-x-1.5 px-4 py-2 border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>{deleting ? 'Deleting...' : 'Delete'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Analysis status banner */}
      {['pending', 'processing'].includes(candidate.analysisStatus) && (
        <div className="p-3 text-xs rounded-xl border bg-brand-500/10 border-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin flex-shrink-0" />
          <span>AI is analyzing this résumé — scores and insights will appear here automatically in a few seconds.</span>
        </div>
      )}
      {candidate.analysisStatus === 'failed' && (
        <div className="p-3 text-xs rounded-xl border bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>AI analysis could not be completed{candidate.analysisError ? `: ${candidate.analysisError}` : '.'} {canManage && 'You can retry with “Re-run AI Analysis”.'}</span>
        </div>
      )}

      {/* Action feedback */}
      {actionMsg.text && (
        <div className={`p-3 text-xs rounded-xl flex items-center border ${
          actionMsg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle size={14} className="mr-2" /> : <AlertCircle size={14} className="mr-2" />}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Real duplicate: same email applied for THIS SAME role more than once. */}
      {candidate.duplicates?.some((d) => d.sameJob) && (
        <div className="p-3 text-xs rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">
              Possible duplicate — this email ({candidate.email}) has other application{candidate.duplicates.filter((d) => d.sameJob).length > 1 ? 's' : ''} for this same role:
            </p>
            <div className="flex flex-wrap gap-2">
              {candidate.duplicates.filter((d) => d.sameJob).map((d) => (
                <Link key={d._id} to={`/candidates/${d._id}`} className="underline hover:no-underline font-medium">
                  {d.name} · {d.status}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Informational: the same person also applied for OTHER open roles. */}
      {candidate.duplicates?.some((d) => !d.sameJob) && (
        <div className="p-3 text-xs rounded-xl border bg-brand-500/10 border-brand-500/20 text-brand-700 dark:text-brand-400 flex items-start gap-2">
          <ArrowRightLeft size={14} className="mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">
              Also applied for {candidate.duplicates.filter((d) => !d.sameJob).length} other role{candidate.duplicates.filter((d) => !d.sameJob).length > 1 ? 's' : ''}:
            </p>
            <div className="flex flex-wrap gap-2">
              {candidate.duplicates.filter((d) => !d.sameJob).map((d) => (
                <Link key={d._id} to={`/candidates/${d._id}`} className="underline hover:no-underline font-medium">
                  {d.jobTitle} · {d.status}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manage action bar */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <button
          onClick={handlePrint}
          className="flex items-center space-x-1.5 px-3 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
        >
          <Printer size={14} />
          <span>Print / PDF</span>
        </button>

        {canManage && (
          <button
            onClick={handleExport}
            title="Download all data held for this candidate (GDPR subject-access request)"
            className="flex items-center space-x-1.5 px-3 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            <FileText size={14} />
            <span>Export Data</span>
          </button>
        )}

        {canManage && (
          <>
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              title="Re-download the resume and re-score it against the current job"
              className="flex items-center space-x-1.5 px-3 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              {reanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>{reanalyzing ? 'Re-analyzing…' : 'Re-run AI Analysis'}</span>
            </button>

            <div className="flex items-center gap-1.5 px-2 py-1 border border-slate-200 dark:border-darkBorder rounded-xl">
              <ArrowRightLeft size={13} className="text-slate-400" />
              <select
                value={candidate.jobId?._id || ''}
                onChange={(e) => handleMoveJob(e.target.value)}
                disabled={moving}
                title="Move candidate to another job"
                className="bg-transparent text-xs font-semibold text-slate-600 dark:text-slate-300 focus:outline-none disabled:opacity-50 py-1"
              >
                <option value={candidate.jobId?._id || ''}>{moving ? 'Moving…' : `Job: ${candidate.jobId?.title || 'Unknown'}`}</option>
                {jobs.filter((j) => j._id !== candidate.jobId?._id).map((j) => (
                  <option key={j._id} value={j._id}>Move to: {j.title}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Grid Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        
        {/* Left column: AI scores & summary */}
        <div className="lg:col-span-1 space-y-3">
          {/* Summary & recommendation card */}
          <div className="p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Resume Match Synthesis
            </h3>
            
            <div className="flex items-center space-x-4">
              <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border ${scoreBox(aiAnalysis?.overallScore || 0)}`}>
                <span className={`text-2xl font-black ${scoreText(aiAnalysis?.overallScore || 0)}`}>
                  {aiAnalysis?.overallScore ?? 0}
                </span>
                <span className="text-[8.5px] font-bold text-slate-400 block -mt-1 uppercase">Match</span>
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Analyzer Recommendation</span>
                <span className={`text-sm font-bold block mt-0.5 ${
                  aiAnalysis?.recommendation?.includes('Hire') ? 'text-emerald-500' :
                  aiAnalysis?.recommendation?.includes('Interview') ? 'text-brand-500' : 'text-red-500'
                }`}>
                  {aiAnalysis?.recommendation || 'Proceed to Screening'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic bg-slate-50 dark:bg-slate-900/30 p-3.5 rounded-xl border border-slate-200/40 dark:border-darkBorder/40">
              "{aiAnalysis?.careerSummary || 'AI model is analyzing qualifications...'}"
            </p>

            <div className="space-y-2.5">
              <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Contact Information</span>
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                {candidate.email && (
                  <div className="flex items-center space-x-2">
                    <Mail size={13} className="text-slate-400" />
                    <span>{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone size={13} className="text-slate-400" />
                    <span>{candidate.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Social links */}
            <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 dark:border-darkBorder">
              {candidate.githubUrl && (
                <a href={candidate.githubUrl} target="_blank" rel="noreferrer" className="p-2 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition">
                  <Github size={15} />
                </a>
              )}
              {candidate.linkedInUrl && (
                <a href={candidate.linkedInUrl} target="_blank" rel="noreferrer" className="p-2 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition">
                  <Linkedin size={15} />
                </a>
              )}
              {candidate.portfolioUrl && (
                <a href={candidate.portfolioUrl} target="_blank" rel="noreferrer" className="p-2 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition">
                  <Globe size={15} />
                </a>
              )}
            </div>
          </div>

          {/* Detailed analysis categories */}
          <div className="p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-4">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Core Score Split
            </h3>
            
            <div className="space-y-3.5">
              {scoreCategories.map((cat, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <span>{cat.label}</span>
                    <span className={`font-bold ${scoreText(cat.value || 0)}`}>{cat.value}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`${scoreBar(cat.value || 0)} h-full rounded-full transition-all duration-300`}
                      style={{ width: `${cat.value}%` }}
                    />
                  </div>
                  <p className="text-[9.5px] text-slate-400/90 leading-normal">{cat.expl}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Middle/Right columns: parsed lists & notes */}
        <div className="lg:col-span-2 space-y-3">

          {/* AI Screening Insights */}
          <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                <Sparkles size={14} className="mr-2 text-brand-500" /> AI Screening Insights
              </h3>
              {aiAnalysis?.screeningVerdict && (
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${verdictClass(aiAnalysis.screeningVerdict)}`}>
                  {aiAnalysis.screeningVerdict}
                </span>
              )}
            </div>

            {/* Insight tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <InsightTile icon={Award} label="Seniority" value={aiAnalysis?.seniorityLevel || '—'} />
              <InsightTile icon={Clock} label="Experience" value={aiAnalysis?.totalYearsExperience != null ? `${aiAnalysis.totalYearsExperience} yr` : '—'} />
              <InsightTile icon={CheckCircle} label="Job Match" value={`${aiAnalysis?.matchPercentage ?? 0}%`} />
              <InsightTile icon={Gauge} label="AI Confidence" value={`${aiAnalysis?.confidence ?? 0}%`} />
            </div>

            {/* Red flags */}
            {aiAnalysis?.redFlags?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center">
                  <AlertTriangle size={13} className="mr-1.5" /> Red Flags ({aiAnalysis.redFlags.length})
                </h4>
                <div className="space-y-1.5">
                  {aiAnalysis.redFlags.map((f, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                      <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <div className="text-[11px] leading-snug">
                        <span className="font-bold text-amber-700 dark:text-amber-400">{f.type}: </span>
                        <span className="text-slate-600 dark:text-slate-400">{f.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested interview questions */}
            {aiAnalysis?.interviewQuestions?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider flex items-center">
                  <MessageSquare size={13} className="mr-1.5" /> Suggested Interview Questions
                </h4>
                <ol className="space-y-1.5 list-none">
                  {aiAnalysis.interviewQuestions.map((q, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[9px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Skills clouds */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark">
            {/* Matched skills */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider flex items-center">
                <CheckCircle size={14} className="mr-1.5" /> Matched Skills ({aiAnalysis?.matchedSkills?.length || 0})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {aiAnalysis?.matchedSkills?.map((skill, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-md text-[10px] font-medium">
                    {skill}
                  </span>
                ))}
                {(!aiAnalysis?.matchedSkills || aiAnalysis.matchedSkills.length === 0) && (
                  <span className="text-[10px] text-slate-400 italic">No direct matches.</span>
                )}
              </div>
            </div>

            {/* Missing skills */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-rose-500 uppercase tracking-wider flex items-center">
                <XCircle size={14} className="mr-1.5" /> Missing Skills ({aiAnalysis?.missingSkills?.length || 0})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {aiAnalysis?.missingSkills?.map((skill, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-md text-[10px] font-medium">
                    {skill}
                  </span>
                ))}
                {(!aiAnalysis?.missingSkills || aiAnalysis.missingSkills.length === 0) && (
                  <span className="text-[10px] text-slate-400 italic">No missing skills identified!</span>
                )}
              </div>
            </div>
          </div>

          {/* Profile CV Details (Work History, Projects, Academics) */}
          <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-4">
            
            {/* Work History */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                <Building size={14} className="mr-2" /> Professional Experience
              </h3>
              
              <div className="relative border-l border-slate-100 dark:border-slate-800 pl-4 ml-2.5 space-y-5">
                {candidate.experience?.map((exp, idx) => (
                  <div key={idx} className="relative text-xs">
                    {/* Circle Bullet */}
                    <span className="absolute -left-[21.5px] top-0.5 w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-800 border border-white dark:border-darkCard" />
                    
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-200">{exp.title}</h4>
                        <span className="text-[10px] font-semibold text-brand-500">{exp.company}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">{exp.startDate} - {exp.endDate}</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{exp.description}</p>
                  </div>
                ))}
                {(!candidate.experience || candidate.experience.length === 0) && (
                  <p className="text-[10px] text-slate-400 italic">No professional experience listed.</p>
                )}
              </div>
            </div>

            {/* Projects */}
            {candidate.projects && candidate.projects.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-darkBorder">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                  <FolderGit2 size={14} className="mr-2" /> Personal Projects
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {candidate.projects.map((proj, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/35 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl space-y-1">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 text-xs">{proj.title}</h4>
                        {proj.link && (
                          <a href={proj.link} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-500">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-normal">{proj.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education History */}
            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-darkBorder">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                <GraduationCap size={14} className="mr-2" /> Academic Pedigree
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {candidate.education?.map((edu, idx) => (
                  <div key={idx} className="flex space-x-3">
                    <div className="p-2 w-9 h-9 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-darkBorder/60 rounded-xl flex items-center justify-center text-slate-400 flex-shrink-0">
                      <GraduationCap size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 leading-snug">{edu.degree} in {edu.fieldOfStudy}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{edu.school} ({edu.startYear} - {edu.endYear})</p>
                    </div>
                  </div>
                ))}
                {(!candidate.education || candidate.education.length === 0) && (
                  <p className="text-[10px] text-slate-400 italic">No academic history parsed.</p>
                )}
              </div>
            </div>

          </div>

          {/* Interview Schedule Section */}
          <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                <CalendarPlus size={14} className="mr-2" /> Interview Schedule
              </h3>
              {canManage && (
                <button
                  onClick={() => setShowInterviewForm((s) => !s)}
                  className="flex items-center space-x-1 text-[11px] font-semibold text-brand-500 hover:text-brand-600 transition"
                >
                  {showInterviewForm ? <X size={13} /> : <Plus size={13} />}
                  <span>{showInterviewForm ? 'Cancel' : 'Schedule'}</span>
                </button>
              )}
            </div>

            {/* Schedule form */}
            {canManage && showInterviewForm && (
              <form onSubmit={handleScheduleInterview} className="grid grid-cols-2 gap-2.5 p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl">
                <select
                  value={interviewForm.stage}
                  onChange={(e) => setInterviewForm((f) => ({ ...f, stage: e.target.value }))}
                  className="h-9 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  {['Interview', 'Technical Round', 'HR Round', 'Screening', 'Final Round'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  required
                  value={interviewForm.scheduledAt}
                  onChange={(e) => setInterviewForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  className="h-9 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                />
                <select
                  value={interviewForm.mode}
                  onChange={(e) => setInterviewForm((f) => ({ ...f, mode: e.target.value }))}
                  className="h-9 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  {['Online', 'In-person', 'Phone'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={interviewForm.locationOrLink}
                  onChange={(e) => setInterviewForm((f) => ({ ...f, locationOrLink: e.target.value }))}
                  placeholder={interviewForm.mode === 'Online' ? 'Meeting link' : 'Location'}
                  className="h-9 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                />
                <input
                  type="text"
                  value={interviewForm.interviewer}
                  onChange={(e) => setInterviewForm((f) => ({ ...f, interviewer: e.target.value }))}
                  placeholder="Interviewer name"
                  className="h-9 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                />
                <input
                  type="text"
                  value={interviewForm.notes}
                  onChange={(e) => setInterviewForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Notes (optional)"
                  className="h-9 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                />
                <label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={interviewForm.notifyCandidate}
                    onChange={(e) => setInterviewForm((f) => ({ ...f, notifyCandidate: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  Email the invite to the candidate ({candidate.email})
                </label>
                <button
                  type="submit"
                  disabled={savingInterview || !interviewForm.scheduledAt}
                  className="col-span-2 flex items-center justify-center gap-1.5 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition"
                >
                  {savingInterview ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                  <span>Schedule Interview</span>
                </button>
              </form>
            )}

            {/* Scheduled interviews list */}
            <div className="space-y-2.5">
              {candidate.interviews?.map((iv) => (
                <div key={iv._id} className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{iv.stage}</span>
                      <span className="px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 font-semibold text-[9.5px]">{iv.mode}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Clock size={11} />
                      <span>{new Date(iv.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {iv.locationOrLink && <p className="text-[10.5px] text-slate-500 dark:text-slate-400 break-all">{iv.locationOrLink}</p>}
                    {iv.interviewer && <p className="text-[10.5px] text-slate-400">Interviewer: {iv.interviewer}</p>}
                    {iv.notes && <p className="text-[10.5px] text-slate-500 dark:text-slate-400 italic">{iv.notes}</p>}
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleDeleteInterview(iv._id)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded transition flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {(!candidate.interviews || candidate.interviews.length === 0) && (
                <div className="text-center py-5 text-slate-400 italic text-xs">No interviews scheduled.</div>
              )}
            </div>
          </div>

          {/* Screening quiz result */}
          {(candidate.quizResult?.answers?.length > 0 || candidate.quizResult?.score != null) && (
            <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                  <ClipboardList size={14} className="mr-2 text-brand-500" /> Screening Quiz
                </h3>
                <div className="flex items-center gap-2">
                  {candidate.quizResult.score != null && (
                    <span className={`text-sm font-black px-2.5 py-0.5 rounded-lg border ${scoreBox(candidate.quizResult.score)} ${scoreText(candidate.quizResult.score)}`}>
                      {candidate.quizResult.score}% <span className="text-[10px] font-semibold opacity-70">({candidate.quizResult.correct}/{candidate.quizResult.totalScored})</span>
                    </span>
                  )}
                  {candidate.quizResult.tabSwitches > 0 && (
                    <span title="Times the applicant left the tab during the quiz" className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      <AlertTriangle size={10} /> {candidate.quizResult.tabSwitches} tab-switch{candidate.quizResult.tabSwitches > 1 ? 'es' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {(candidate.quizResult.answers || []).map((qa, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border ${qa.type === 'mcq' ? (qa.correct ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20') : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200/50 dark:border-darkBorder/40'}`}>
                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{idx + 1}. {qa.question}</p>
                    {qa.type === 'mcq' ? (
                      <div className="mt-1 text-[11px] space-y-0.5">
                        <p className={qa.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {qa.correct ? <CheckCircle size={11} className="inline mr-1" /> : <XCircle size={11} className="inline mr-1" />}
                          Answered: <span className="font-semibold">{qa.answerText || '—'}</span>
                        </p>
                        {!qa.correct && <p className="text-slate-500">Correct: <span className="font-semibold">{qa.correctAnswer}</span></p>}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-line">{qa.answerText || <span className="italic text-slate-400">No answer</span>}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Application screening responses (public applicants) */}
          {candidate.screeningAnswers?.length > 0 && (
            <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-3">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                <MessageSquare size={14} className="mr-2 text-brand-500" /> Application Responses
              </h3>
              <div className="space-y-3">
                {candidate.screeningAnswers.map((qa, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl">
                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{qa.question}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed whitespace-pre-line">{qa.answer || <span className="italic text-slate-400">No answer</span>}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recruiter Evaluation Notes Section */}
          <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Recruiter Evaluation History
            </h3>
            
            {/* Notes history list */}
            <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
              {candidate.notes?.map((n) => (
                <div key={n._id} className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-[10.5px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{n.author?.name || 'Recruiter'}</span>
                      <span className="text-slate-400">({n.author?.role})</span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-slate-400">
                        {new Date(n.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal pr-4">{n.note}</p>
                  </div>
                  
                  {/* Delete note (Only auth-user can do) */}
                  {(n.author?._id === user?._id || user?.role === 'Admin') && (
                    <button
                      onClick={() => handleDeleteNote(n._id)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded transition flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {(!candidate.notes || candidate.notes.length === 0) && (
                <div className="text-center py-6 text-slate-400 italic text-xs">
                  No evaluations logged yet.
                </div>
              )}
            </div>

            {/* Note submission input */}
            <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-slate-100 dark:border-darkBorder">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log a recruiter interview note or screening evaluation..."
                className="flex-1 h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={addingNote || !newNote.trim()}
                className="px-4.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition shadow-sm"
              >
                {addingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </form>

          </div>

        </div>

      </div>

    </div>
  );
};

// Skeletons
const DetailsSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-6">
        <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
      <div className="lg:col-span-2 space-y-6">
        <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-56 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
    </div>
  </div>
);

export default CandidateDetails;
