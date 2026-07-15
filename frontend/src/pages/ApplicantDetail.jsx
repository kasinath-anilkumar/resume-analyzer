import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ChevronLeft,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Linkedin,
  Globe,
  FileText,
  Pencil,
  KeyRound,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Briefcase,
  MessageSquareQuote,
  ExternalLink,
  MoreVertical
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

const statusBadge = (s) => {
  if (['Hired', 'Offer'].includes(s)) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  if (s === 'Rejected') return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
  if (['Shortlisted', 'Interview', 'Technical Round', 'HR Round'].includes(s)) return 'bg-brand-500/10 text-brand-600 border-brand-500/20';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200/40';
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

const getStatusStepIndex = (status) => {
  if (status === 'Hired') return 4;
  if (status === 'Offer') return 3;
  if (['Interview', 'Technical Round', 'HR Round'].includes(status)) return 2;
  if (status === 'Shortlisted') return 1;
  return 0; // 'Applied' or 'Screening'
};

const renderApplicationRoadmap = (status) => {
  const isRejected = status === 'Rejected';
  const steps = ['Applied', 'Shortlisted', 'Interview', 'Offer', isRejected ? 'Rejected' : 'Hired'];
  const currentStep = isRejected ? 4 : getStatusStepIndex(status);

  return (
    <div className="w-full py-2">
      <div className="relative flex items-center justify-between w-full">
        {/* Track Lines */}
        <div className="absolute left-0 right-0 top-1.5 h-0.5 bg-slate-200 dark:bg-darkBorder/60 z-0" />
        <div
          className={`absolute left-0 top-1.5 h-0.5 transition-all duration-500 z-0 ${isRejected ? 'bg-rose-500' : 'bg-brand-500'
            }`}
          style={{ width: `${(currentStep / 4) * 100}%` }}
        />

        {/* Nodes */}
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isActive = idx === currentStep;

          let nodeBg = 'bg-slate-200 dark:bg-slate-800';
          let borderCol = 'border-slate-350 dark:border-darkBorder';
          let textCol = 'text-slate-400 dark:text-slate-500';

          if (isCompleted) {
            nodeBg = isRejected ? 'bg-rose-500' : 'bg-brand-500';
            borderCol = isRejected ? 'border-rose-500' : 'border-brand-500';
            textCol = isRejected ? 'text-rose-500 font-semibold' : 'text-brand-500 font-semibold';
          } else if (isActive) {
            nodeBg = isRejected ? 'bg-rose-100 dark:bg-rose-950/40' : 'bg-brand-50 dark:bg-brand-950/40';
            borderCol = isRejected ? 'border-rose-500 border-2' : 'border-brand-500 border-2';
            textCol = isRejected ? 'text-rose-600 font-bold' : 'text-brand-600 font-bold';
          }

          return (
            <div key={step} className="flex flex-col items-center relative flex-1 text-center">
              {/* Spacer Wrapper around Node */}
              <div className="bg-white dark:bg-darkCard px-1.5 relative z-10">
                <div
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border flex items-center justify-center transition-all duration-300 ${nodeBg} ${borderCol} ${isActive ? 'scale-110 shadow-sm' : ''
                    }`}
                >
                  {isCompleted && (
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                  {isActive && (
                    <div className={`w-1.5 h-1.5 rounded-full ${isRejected ? 'bg-rose-500' : 'bg-brand-500'} animate-ping`} />
                  )}
                </div>
              </div>

              {/* Step Label */}
              <span className={`text-[7.5px] sm:text-[9px] uppercase tracking-wider mt-1.5 ${textCol}`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const fieldStyle =
  'w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition duration-200';

const labelStyle = 'text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider block';

const ApplicantDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = ['Admin', 'Recruiter'].includes(user?.role);

  const [applicant, setApplicant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [actionsOpen, setActionsOpen] = useState(false);

  const flash = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 5000);
  };

  const load = () => {
    setLoading(true);
    api
      .get(`/applicants/${id}`)
      .then((res) => {
        if (res.data.success) setApplicant(res.data.data);
      })
      .catch(() => flash('error', 'Could not load this portal user.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  const startEdit = () => {
    setForm({
      name: applicant.name || '',
      phone: applicant.phone || '',
      location: applicant.location || '',
      linkedinUrl: applicant.linkedinUrl || '',
      portfolioUrl: applicant.portfolioUrl || '',
      bio: applicant.bio || '',
    });
    setEditing(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.put(`/applicants/${id}`, form);
      if (res.data.success) {
        setApplicant((p) => ({ ...p, ...res.data.data }));
        setEditing(false);
        flash('success', 'Profile updated.');
      } else {
        flash('error', res.data.message || 'Update failed.');
      }
    } catch (err) {
      flash('error', err.response?.data?.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const isFormDirty = () => {
    if (!applicant) return false;
    return (
      (form.name || '').trim() !== (applicant.name || '') ||
      (form.phone || '').trim() !== (applicant.phone || '') ||
      (form.location || '').trim() !== (applicant.location || '') ||
      (form.linkedinUrl || '').trim() !== (applicant.linkedinUrl || '') ||
      (form.portfolioUrl || '').trim() !== (applicant.portfolioUrl || '') ||
      (form.bio || '').trim() !== (applicant.bio || '')
    );
  };

  const sendReset = async () => {
    if (!window.confirm(`Email a password-reset link to ${applicant.email}?`)) return;
    setBusy(true);
    try {
      const res = await api.post(`/applicants/${id}/send-reset`);
      flash(res.data.success ? 'success' : 'error', res.data.message);
    } catch (err) {
      flash('error', err.response?.data?.message || 'Could not send reset link.');
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (
      !window.confirm(
        `Delete ${applicant.name}'s portal account?\n\nTheir applications are KEPT (just unlinked from the account). This removes only the login account.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await api.delete(`/applicants/${id}`);
      if (res.data.success) {
        window.alert(res.data.message);
        navigate('/applicants');
      }
    } catch (err) {
      flash('error', err.response?.data?.message || 'Delete failed.');
      setBusy(false);
    }
  };

  const erasePerson = async () => {
    if (
      !window.confirm(
        `GDPR ERASE ${applicant.name} (${applicant.email})?\n\nThis permanently deletes their portal account AND all ${applicant.applications?.length || 0
        } of their applications AND every résumé file. This CANNOT be undone.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await api.delete(`/applicants/${id}/erase`);
      if (res.data.success) {
        window.alert(res.data.message);
        navigate('/applicants');
      }
    } catch (err) {
      flash('error', err.response?.data?.message || 'Erase failed.');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }
  if (!applicant) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="mx-auto text-slate-400 mb-3" size={32} />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Portal user not found</h3>
        <Link
          to="/applicants"
          className="text-xs text-brand-500 mt-3 inline-flex items-center gap-1 hover:underline"
        >
          <ChevronLeft size={13} /> Back
        </Link>
      </div>
    );
  }

  const apps = applicant.applications || [];
  const matchScores = apps.map((app) => app.score || 0);
  const maxScore = matchScores.length > 0 ? Math.max(...matchScores) : 0;
  const activeCount = apps.filter((app) => !['Rejected', 'Hired'].includes(app.status)).length;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-10">

      {/* Toast Alert Box */}
      {msg.text && (
        <div
          className={`flex items-center gap-2.5 p-3.5 rounded-xl text-xs border ${msg.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
            }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span className="font-semibold">{msg.text}</span>
        </div>
      )}

      {/* Premium Header Banner Card */}
      <div className="p-4 sm:p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark relative flex items-center justify-between gap-4 transition-all duration-300 hover:shadow-lg">
        <div className="absolute top-0 right-0 w-48 h-48 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />

        {/* Back Link & Avatar Panel */}
        <div className="flex items-center space-x-2 sm:space-x-3.5 relative z-10 min-w-0">
          <Link
            to="/applicants"
            className="group p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition duration-200 flex-shrink-0"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
          </Link>
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white flex items-center justify-center font-extrabold text-sm sm:text-base uppercase shadow-md shadow-brand-500/15 flex-shrink-0">
              {(applicant.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">{applicant.name}</h2>
              <p className="text-[9px] sm:text-xs text-slate-400 font-medium mt-0.5 truncate">
                Registered {fmtDate(applicant.createdAt)} • {apps.length} application{apps.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Action Buttons Group */}
        {canManage && !editing && (
          <div className="flex items-center gap-1.5 sm:gap-2 relative z-10 flex-shrink-0">
            <button
              onClick={startEdit}
              disabled={busy}
              className="flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
            >
              <Pencil size={13} className="text-brand-500" />
              <span className="hidden sm:inline">Edit Profile</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setActionsOpen(!actionsOpen)}
                disabled={busy}
                className="p-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-500 dark:text-slate-400 rounded-xl transition cursor-pointer"
                title="More actions"
              >
                <MoreVertical size={14} />
              </button>

              {actionsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl shadow-lg py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        sendReset();
                      }}
                      className="flex items-center w-full px-3 py-2.5 text-left text-xs text-slate-650 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer"
                    >
                      <KeyRound size={13} className="mr-2 text-indigo-500" />
                      <span>Send Reset Link</span>
                    </button>
                    <div className="h-[1px] bg-slate-100 dark:bg-darkBorder/40 my-1" />
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        deleteAccount();
                      }}
                      className="flex items-center w-full px-3 py-2.5 text-left text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                    >
                      <Trash2 size={13} className="mr-2 text-rose-500" />
                      <span>Delete Account</span>
                    </button>
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        erasePerson();
                      }}
                      className="flex items-center w-full px-3 py-2.5 text-left text-xs text-rose-605 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer font-bold"
                    >
                      <AlertTriangle size={13} className="mr-2 text-rose-500" />
                      <span>Permanent Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Account Profile Summary Card */}
        <div className="lg:col-span-1">
          <div className="p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-5 relative overflow-hidden transition-all duration-300 hover:shadow-lg h-full">

            {editing ? (
              /* Profile Edit Form */
              <form onSubmit={saveEdit} className="space-y-4">
                <div className="border-b border-slate-100 dark:border-darkBorder/40 pb-2.5 flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Edit Portal Profile</h3>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className={labelStyle}>Full Name</label>
                    <input
                      required
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className={fieldStyle}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelStyle}>Phone Number</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className={fieldStyle}
                      placeholder="e.g. +917736807013"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelStyle}>Current Location</label>
                    <input
                      value={form.location}
                      onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                      className={fieldStyle}
                      placeholder="e.g. Bangalore, India"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelStyle}>LinkedIn URL</label>
                    <input
                      value={form.linkedinUrl}
                      onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                      className={fieldStyle}
                      placeholder="https://linkedin.com/in/username"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelStyle}>Portfolio URL</label>
                    <input
                      value={form.portfolioUrl}
                      onChange={(e) => setForm((f) => ({ ...f, portfolioUrl: e.target.value }))}
                      className={fieldStyle}
                      placeholder="https://mywebsite.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelStyle}>Bio</label>
                    <textarea
                      rows="3"
                      value={form.bio}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      className="w-full p-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-705 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y transition duration-200"
                      placeholder="Brief candidate description..."
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-darkBorder/40">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                  >
                    <X size={13} />
                    <span>Cancel</span>
                  </button>
                  {isFormDirty() && (
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-55 transition shadow-sm cursor-pointer animate-in fade-in zoom-in duration-200"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      <span>Save Changes</span>
                    </button>
                  )}
                </div>
              </form>
            ) : (
              /* Profile Details View */
              <div className="space-y-5">
                {/* Biography bubble summary */}
                <div className="bg-slate-50/50 dark:bg-slate-900/30 p-4 border border-slate-100 dark:border-darkBorder/40 rounded-2xl relative">
                  <MessageSquareQuote size={18} className="text-brand-500/30 absolute right-3.5 top-3" />
                  <span className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-505 uppercase tracking-widest block mb-1">Applicant Summary</span>
                  <p className="text-xs text-slate-650 dark:text-slate-400 leading-relaxed italic pr-4">
                    {applicant.bio ? `"${applicant.bio}"` : 'No custom summary bio added to this profile yet.'}
                  </p>
                </div>

                {/* Structured Contact Details */}
                <div className="space-y-3 pt-1">
                  <span className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-505 uppercase tracking-widest block">Contact Details</span>
                  <div className="divide-y divide-slate-100 dark:divide-darkBorder/30 text-xs text-slate-650 dark:text-slate-400">
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-slate-400 font-medium">Email Address</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-205 select-all truncate max-w-[170px]">{applicant.email}</span>
                    </div>
                    {applicant.phone && (
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-slate-400 font-medium">Phone number</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-205 select-all">{applicant.phone}</span>
                      </div>
                    )}
                    {applicant.location && (
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-slate-400 font-medium">Current Location</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-205 flex items-center gap-1">
                          <MapPin size={11} className="text-brand-500" /> {applicant.location}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resume File Attachment card */}
                {applicant.resumeUrl && (
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-505 uppercase tracking-widest block">Attached Resume</span>
                    <a
                      href={applicant.resumeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center space-x-3 p-3 bg-slate-50/50 hover:bg-slate-100/50 dark:bg-slate-900/40 dark:hover:bg-slate-800/40 border border-slate-200/60 dark:border-darkBorder rounded-2xl text-xs font-bold text-slate-750 dark:text-slate-300 transition duration-200"
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
            )}

          </div>
        </div>

        {/* Right Column: Submitted Applications Roadmap Timeline */}
        <div className="lg:col-span-2">
          <div className="p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-5 h-full">

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkBorder/40 pb-3">
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center">
                  <Briefcase size={14} className="mr-2 text-brand-500" /> Application History Roadmap
                </h3>
                <p className="text-[9.5px] text-slate-400">Roadmap timeline of all positions applied to by this account.</p>
              </div>
              <span className="text-[10px] font-bold bg-brand-500/10 text-brand-600 px-3 py-1 rounded-xl border border-brand-500/25">
                {apps.length} Submitted
              </span>
            </div>

            {/* Performance Metric Stat Tiles */}
            {apps.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase block">Total Applied</span>
                  <span className="text-xs sm:text-base font-extrabold text-slate-850 dark:text-slate-100 mt-0.5">{apps.length}</span>
                </div>
                <div className="p-2 sm:p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase block">Max Match %</span>
                  <span className={`text-xs sm:text-base font-extrabold mt-0.5 ${maxScore >= 80 ? 'text-emerald-500' : maxScore >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{maxScore}%</span>
                </div>
                <div className="p-2 sm:p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase block">In Screening</span>
                  <span className="text-xs sm:text-base font-extrabold text-indigo-500 mt-0.5">{activeCount}</span>
                </div>
              </div>
            )}

            {/* Timeline structure */}
            {apps.length === 0 ? (
              <div className="text-center py-16 text-slate-400 italic text-xs flex flex-col items-center justify-center space-y-2">
                <Briefcase size={32} className="text-slate-350 dark:text-slate-700" />
                <span>No submitted applications found for this user account.</span>
              </div>
            ) : (
              <div className="relative border-l-2 border-dashed border-slate-200 dark:border-darkBorder/40 pl-6 ml-3.5 space-y-5 py-1">
                {apps.map((app) => (
                  <div key={app._id} className="relative group">

                    {/* Timeline Node shape */}
                    <div className="absolute -left-[32px] top-4.5 flex items-center justify-center z-10">
                      <div className={`w-3.5 h-3.5 rotate-45 border-2 border-white dark:border-darkCard shadow-sm rounded-sm ${statusNodeColor(app.status)} transition-transform duration-300 group-hover:scale-110`} />
                    </div>

                    {/* Timeline application panel card */}
                    <div className="p-4 bg-slate-50/50 hover:bg-white dark:bg-slate-900/30 dark:hover:bg-slate-800/10 border border-slate-200/60 dark:border-darkBorder/50 hover:border-brand-500/25 dark:hover:border-brand-500/15 rounded-2xl transition duration-300 hover:shadow-premium dark:hover:shadow-premium-dark  space-y-4">

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                            {app.job?.title || 'Unknown role'}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-600 dark:text-slate-350">{app.job?.department || '—'}</span>
                            <span>•</span>
                            <span>Applied {fmtDate(app.createdAt)}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                          {/* Match Score Badge */}
                          {app.score > 0 && (
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${scoreBox(app.score)} ${scoreText(app.score)} shadow-inner`}>
                              {app.score}% Match
                            </span>
                          )}

                          {/* Status tag */}
                          <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${statusBadge(app.status)}`}>
                            {app.status}
                          </span>

                          {/* Actions details link button */}
                          <Link
                            to={`/candidates/${app._id}`}
                            className="flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-brand-500 hover:text-white hover:bg-brand-600 transition border border-brand-500/20 hover:border-brand-650 rounded-lg px-2.5 py-1 w-full sm:w-auto text-center"
                          >
                            <span>View Resume</span>
                          </Link>
                        </div>
                      </div>

                      {/* Stepper progress roadmap */}
                      <div className="pt-3 border-t border-slate-100 dark:border-darkBorder/40">
                        {renderApplicationRoadmap(app.status)}
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

export default ApplicantDetail;
