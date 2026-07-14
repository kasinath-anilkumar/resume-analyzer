import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { CITY_SUGGESTIONS } from '../data/cities';
import { UserPlus, Loader2, AlertCircle, ArrowLeft, Users } from 'lucide-react';

const STATUSES = ['Applied', 'Screening', 'Shortlisted', 'Interview', 'Technical Round', 'HR Round', 'Offer', 'Hired', 'Rejected'];

const inputCls =
  'w-full h-11 px-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';
const labelCls = 'text-xs font-semibold text-slate-500 dark:text-slate-400';

const AddCandidate = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    jobId: '', name: '', email: '', phone: '', currentLocation: '', salaryExpectation: '',
    skills: '', linkedInUrl: '', portfolioUrl: '', githubUrl: '', summary: '', status: 'Applied',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.get('/jobs?status=Active')
      .then((res) => {
        if (res.data.success) {
          setJobs(res.data.data);
          if (res.data.data.length) setForm((f) => ({ ...f, jobId: res.data.data[0]._id }));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingJobs(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.jobId) {
      setError('Name, email and a target job are required.');
      return;
    }
    if (!form.email.includes('@')) { setError('Please enter a valid email address.'); return; }
    setSaving(true);
    try {
      const res = await api.post('/candidates/manual', form);
      if (res.data.success) navigate(`/candidates/${res.data.data._id}`);
      else setError(res.data.message || 'Could not add candidate.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add candidate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300 max-w-3xl mx-auto pb-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center">
            <UserPlus size={18} className="mr-2 text-brand-500" /> Add Candidate Manually
          </h2>
          <p className="text-xs text-slate-500">For candidates without a résumé — enter their details directly.</p>
        </div>
        <Link to="/candidates" className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition">
          <Users size={14} /> Candidates
        </Link>
      </div>

      <form onSubmit={submit} className="p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Target job */}
        <div className="space-y-1.5">
          <label className={labelCls}>Target Job Opening *</label>
          {loadingJobs ? (
            <div className="h-11 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ) : jobs.length === 0 ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-xs">
              No active jobs. <Link to="/jobs" className="font-semibold underline">Create one</Link> first.
            </div>
          ) : (
            <select value={form.jobId} onChange={set('jobId')} className={inputCls} required>
              {jobs.map((j) => <option key={j._id} value={j._id}>{j.title} — {j.department}, {j.location}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Full Name *</label>
            <input value={form.name} onChange={set('name')} className={inputCls} placeholder="Jane Doe" required />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Email *</label>
            <input type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="jane@email.com" required />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="+91 90000 00000" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Current Location</label>
            <input list="add-city-suggestions" value={form.currentLocation} onChange={set('currentLocation')} className={inputCls} placeholder="Kochi, Kerala" />
            <datalist id="add-city-suggestions">
              {CITY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Salary Expectation</label>
            <input value={form.salaryExpectation} onChange={set('salaryExpectation')} className={inputCls} placeholder="₹30,000 / month or Negotiable" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Initial Status</label>
            <select value={form.status} onChange={set('status')} className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Skills <span className="text-slate-400 font-normal">(comma-separated)</span></label>
          <input value={form.skills} onChange={set('skills')} className={inputCls} placeholder="React, Node.js, Sales, Communication" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>LinkedIn URL</label>
            <input value={form.linkedInUrl} onChange={set('linkedInUrl')} className={inputCls} placeholder="https://linkedin.com/in/…" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Portfolio URL</label>
            <input value={form.portfolioUrl} onChange={set('portfolioUrl')} className={inputCls} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>GitHub URL</label>
            <input value={form.githubUrl} onChange={set('githubUrl')} className={inputCls} placeholder="https://github.com/…" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Summary / Background</label>
          <textarea rows="4" value={form.summary} onChange={set('summary')} className="w-full p-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y" placeholder="Experience, education, notable achievements — this also helps rank them in cross-role recommendations." />
        </div>

        <p className="text-[11px] text-slate-400">
          Manually-added candidates have no AI screening score (there's no résumé to analyze), but they're ranked in
          cross-role recommendations by the skills and summary you enter. You can re-assign or update them anytime.
        </p>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-darkBorder">
          <Link to="/candidates" className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
            <ArrowLeft size={14} /> Cancel
          </Link>
          <button type="submit" disabled={saving || jobs.length === 0} className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow transition">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            <span>{saving ? 'Adding…' : 'Add Candidate'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCandidate;
