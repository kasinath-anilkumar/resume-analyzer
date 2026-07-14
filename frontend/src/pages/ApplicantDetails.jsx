import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  User,
  Mail,
  Phone,
  Linkedin,
  Globe,
  FileText,
  Calendar,
  MapPin,
  ChevronLeft,
  Loader2,
  AlertCircle,
  ExternalLink,
  ClipboardList,
  MessageSquareQuote,
  Activity,
  Award
} from 'lucide-react';

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

const scoreText = (v = 0) =>
  v >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : v >= 60 ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';

const scoreBox = (v = 0) =>
  v >= 80 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'
    : v >= 60 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30'
      : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30';

const statusBadgeClass = (status) => {
  switch (status) {
    case 'Hired': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'Offer': return 'bg-teal-500/10 text-teal-600 border-teal-500/20';
    case 'Rejected': return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    case 'Interview':
    case 'Technical Round':
    case 'HR Round': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    case 'Shortlisted': return 'bg-brand-500/10 text-brand-600 border-brand-500/20';
    default: return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
  }
};

const statusNodeColor = (status) => {
  switch (status) {
    case 'Hired': return 'bg-emerald-500';
    case 'Offer': return 'bg-teal-500';
    case 'Rejected': return 'bg-rose-500';
    case 'Interview':
    case 'Technical Round':
    case 'HR Round': return 'bg-purple-500';
    case 'Shortlisted': return 'bg-brand-500';
    default: return 'bg-slate-400';
  }
};

const ApplicantDetails = () => {
  const { id } = useParams();
  const [applicant, setApplicant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchApplicant = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/applicants/${id}`);
        if (res.data.success) {
          setApplicant(res.data.data);
        }
      } catch (err) {
        console.error(err);
        setError('Could not retrieve portal user details.');
      } finally {
        setLoading(false);
      }
    };
    fetchApplicant();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (error || !applicant) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <AlertCircle className="text-rose-500 mb-3" size={32} />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{error || 'Portal user account not found'}</h3>
        <Link to="/applicants" className="text-xs text-brand-500 mt-2 hover:underline flex items-center">
          <ChevronLeft size={14} className="mr-1" /> Back to users list
        </Link>
      </div>
    );
  }

  // Calculate metrics
  const matchScores = applicant.applications?.map((app) => app.score) || [];
  const maxScore = matchScores.length > 0 ? Math.max(...matchScores) : 0;
  const activeCount = applicant.applications?.filter((app) => !['Rejected', 'Hired'].includes(app.status)).length || 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-10">

      {/* Premium Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gradient-to-r from-brand-600 to-indigo-700 text-white rounded-2xl shadow-md relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="relative z-10 flex items-center space-x-3.5">
          <Link
            to="/applicants"
            className="group p-2 text-white/80 hover:text-white border border-white/20 hover:border-white/40 rounded-xl hover:bg-white/10 transition duration-200"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
          </Link>
          <div>
            <h2 className="text-base sm:text-lg md:text-xl font-extrabold tracking-tight">Portal Registrant Profile</h2>
            <p className="text-[10px] sm:text-[11px] text-brand-100 max-w-xl font-light">
              Review applicant profile information, biography summaries, and cross-role application statuses.
            </p>
          </div>
        </div>
        <span className="relative z-10 text-xs font-semibold bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl">
          Account Verified
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Left Column: Account Profile Summary Card */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-5 relative overflow-hidden transition-all duration-300 hover:shadow-lg">

            {/* Elegant Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />

            {/* Avatar block */}
            <div className="flex items-center space-x-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg uppercase shadow-md shadow-brand-500/20">
                {applicant.name?.slice(0, 2) || 'U'}
              </div>
              <div className="min-w-0">
                <span className="text-[9.5px] font-extrabold text-brand-600 dark:text-brand-400 uppercase tracking-wider block">Candidate Registrant</span>
                <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 truncate -mt-0.5">{applicant.name}</h3>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Joined {fmtDate(applicant.createdAt)}</span>
              </div>
            </div>

            {/* Biography bubble summary */}
            <div className="bg-slate-50/50 dark:bg-slate-900/30 p-4 border border-slate-100 dark:border-darkBorder/40 rounded-2xl relative">
              <MessageSquareQuote size={18} className="text-brand-500/30 absolute right-3.5 top-3" />
              <span className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Applicant Summary</span>
              <p className="text-xs text-slate-600 dark:text-slate-450 leading-relaxed italic pr-4">
                {applicant.bio ? `"${applicant.bio}"` : 'No custom summary bio added to this profile yet.'}
              </p>
            </div>

            {/* Structured Contact Details */}
            <div className="space-y-3 pt-1">
              <span className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Contact Details</span>
              <div className="divide-y divide-slate-100 dark:divide-darkBorder/30 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400 font-medium">Email Address</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 select-all truncate max-w-[180px]">{applicant.email}</span>
                </div>
                {applicant.phone && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-400 font-medium">Phone number</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 select-all">{applicant.phone}</span>
                  </div>
                )}
                {applicant.location && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-400 font-medium">Current Location</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <MapPin size={11} className="text-brand-500" /> {applicant.location}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Resume File Attachment card */}
            {applicant.resumeUrl && (
              <div className="space-y-2.5 pt-2">
                <span className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Attached Resume</span>
                <a
                  href={applicant.resumeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-3 p-3 bg-slate-50/50 hover:bg-slate-100/50 dark:bg-slate-900/40 dark:hover:bg-slate-800/40 border border-slate-200/60 dark:border-darkBorder rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-300 transition duration-200"
                >
                  <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} />
                  </div>
                  <span className="truncate flex-1">Download Candidate CV</span>
                  <ExternalLink size={12} className="text-slate-400 flex-shrink-0" />
                </a>
              </div>
            )}

            {/* Social Handles panel */}
            {(applicant.linkedinUrl || applicant.portfolioUrl) && (
              <div className="flex items-center justify-center space-x-3 pt-4 border-t border-slate-100 dark:border-darkBorder/40">
                {applicant.linkedinUrl && (
                  <a
                    href={applicant.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold transition"
                  >
                    <Linkedin size={14} />
                    <span>LinkedIn</span>
                  </a>
                )}
                {applicant.portfolioUrl && (
                  <a
                    href={applicant.portfolioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs font-semibold transition"
                  >
                    <Globe size={14} />
                    <span>Website</span>
                  </a>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Right Column: Submitted Applications Roadmap Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-5">

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkBorder/40 pb-3">
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center">
                  <ClipboardList size={14} className="mr-2 text-brand-500" /> Application History Roadmap
                </h3>
                <p className="text-[9.5px] text-slate-400">Roadmap timeline of all positions applied to by this account.</p>
              </div>
              <span className="text-[10px] font-bold bg-brand-500/10 text-brand-600 px-3 py-1 rounded-xl border border-brand-500/25">
                {applicant.applications?.length || 0} Submitted
              </span>
            </div>

            {/* Performance Metric Stat Tiles */}
            {applicant.applications?.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Total Applied</span>
                  <span className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">{applicant.applications.length}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Max Match %</span>
                  <span className={`text-sm sm:text-base font-extrabold mt-0.5 ${maxScore >= 80 ? 'text-emerald-500' : maxScore >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{maxScore}%</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">In Screening</span>
                  <span className="text-sm sm:text-base font-extrabold text-indigo-500 mt-0.5">{activeCount}</span>
                </div>
              </div>
            )}

            {/* Timeline structure */}
            {(!applicant.applications || applicant.applications.length === 0) ? (
              <div className="text-center py-16 text-slate-400 italic text-xs flex flex-col items-center justify-center space-y-2">
                <ClipboardList size={32} className="text-slate-300 dark:text-slate-700" />
                <span>No submitted applications found for this user account.</span>
              </div>
            ) : (
              <div className="relative border-l-2 border-dashed border-slate-200 dark:border-darkBorder/40 pl-6 ml-3.5 space-y-5 py-1">
                {applicant.applications.map((app) => (
                  <div key={app._id} className="relative group">

                    {/* Timeline Node shape */}
                    <div className="absolute -left-[32px] top-4.5 flex items-center justify-center z-10">
                      <div className={`w-3.5 h-3.5 rotate-45 border-2 border-white dark:border-darkCard shadow-sm rounded-sm ${statusNodeColor(app.status)} transition-transform duration-300 group-hover:scale-110`} />
                    </div>

                    {/* Timeline application panel card */}
                    <div className="p-4 bg-slate-50/50 hover:bg-white dark:bg-slate-900/30 dark:hover:bg-slate-800/10 border border-slate-200/60 dark:border-darkBorder/50 hover:border-brand-500/25 dark:hover:border-brand-500/15 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition duration-300 hover:shadow-premium dark:hover:shadow-premium-dark hover:-translate-y-0.5">

                      <div className="space-y-1">
                        <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                          {app.job?.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-600 dark:text-slate-300">{app.job?.department}</span>
                          <span>•</span>
                          <span>Applied {fmtDate(app.createdAt)}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">
                        {/* Match Score Badge */}
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${scoreBox(app.score)} ${scoreText(app.score)} shadow-inner`}>
                          {app.score}% Match
                        </span>

                        {/* Status tag */}
                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${statusBadgeClass(app.status)}`}>
                          {app.status}
                        </span>

                        {/* Actions details link button */}
                        <Link
                          to={`/candidates/${app._id}`}
                          className="flex items-center text-[10px] font-bold uppercase tracking-wider text-brand-500 hover:text-white hover:bg-brand-600 transition border border-brand-500/20 hover:border-brand-650 rounded-lg px-2.5 py-1"
                        >
                          <span>Review Screening</span>
                        </Link>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>

    </div>
  );
};

export default ApplicantDetails;
