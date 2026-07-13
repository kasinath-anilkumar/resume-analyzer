import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  Briefcase, MapPin, Clock, ChevronLeft, Loader2, UploadCloud,
  CheckCircle2, AlertCircle, FileText
} from 'lucide-react';

const ACCEPT = '.pdf,.doc,.docx,.txt,.rtf,image/*';

const CareerApply = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [answers, setAnswers] = useState([]); // [{question, answer}]
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // success message

  useEffect(() => {
    api.get(`/public/jobs/${id}`)
      .then((res) => {
        if (res.data.success) {
          setJob(res.data.data);
          setAnswers((res.data.data.screeningQuestions || []).map((q) => ({ question: q, answer: '' })));
        } else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email) { setError('Please provide your name and email.'); return; }
    if (!file) { setError('Please attach your résumé.'); return; }

    const fd = new FormData();
    fd.append('resume', file);
    fd.append('jobId', id);
    fd.append('name', form.name);
    fd.append('email', form.email);
    fd.append('phone', form.phone);
    fd.append('screeningAnswers', JSON.stringify(answers.filter((a) => a.answer.trim())));

    setSubmitting(true);
    try {
      const res = await api.post('/public/apply', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success) setDone(res.data.message);
      else setError(res.data.message || 'Could not submit your application.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const input = 'w-full h-11 px-3.5 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-darkBg"><Loader2 size={30} className="animate-spin text-brand-500" /></div>;

  if (notFound || !job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-darkBg p-6 text-center">
        <AlertCircle className="text-rose-500 mb-3" size={34} />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">This position is no longer open.</h3>
        <Link to="/careers" className="text-xs text-brand-500 mt-2 hover:underline flex items-center"><ChevronLeft size={14} className="mr-1" /> Back to all positions</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg text-slate-900 dark:text-slate-200">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <Link to="/careers" className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-brand-500 mb-5"><ChevronLeft size={14} className="mr-1" /> All positions</Link>

        {/* Job header */}
        <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-6 shadow-premium dark:shadow-premium-dark">
          <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">{job.department}</span>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{job.title}</h1>
          <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><MapPin size={13} /> {job.location}</span>
            <span className="flex items-center gap-1"><Clock size={13} /> {job.employmentType}</span>
            {job.experience && <span className="flex items-center gap-1"><Briefcase size={13} /> {job.experience}</span>}
            {job.salaryRange && <span className="font-semibold text-slate-600 dark:text-slate-300">{job.salaryRange}</span>}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-4 leading-relaxed whitespace-pre-line">{job.description}</p>
          {job.requiredSkills?.length > 0 && (
            <div className="mt-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Required Skills</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {job.requiredSkills.map((s, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-600 border border-brand-500/20">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Application form / success */}
        {done ? (
          <div className="mt-5 bg-white dark:bg-darkCard border border-emerald-500/30 rounded-2xl p-8 text-center shadow-premium dark:shadow-premium-dark">
            <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={40} />
            <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">Application received</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">{done}</p>
            <Link to="/careers" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 mt-5 hover:underline">Browse more positions</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-6 shadow-premium dark:shadow-premium-dark space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Apply for this role</h3>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center"><AlertCircle size={15} className="mr-2" />{error}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500">Full Name *</label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" className={input} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500">Email *</label>
                <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@email.com" className={input} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-semibold text-slate-500">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 1234" className={input} />
              </div>
            </div>

            {/* Résumé upload */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500">Résumé *</label>
              <label className={`flex items-center gap-2 h-11 px-3.5 border border-dashed rounded-xl cursor-pointer transition ${file ? 'border-emerald-400 bg-emerald-500/5' : 'border-slate-300 dark:border-darkBorder hover:border-brand-400'}`}>
                {file ? <FileText size={16} className="text-emerald-500" /> : <UploadCloud size={16} className="text-slate-400" />}
                <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{file ? file.name : 'Attach your résumé (PDF, DOC, DOCX, image…)'}</span>
                <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            {/* Screening questions */}
            {answers.length > 0 && (
              <div className="space-y-3 pt-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">A few questions</span>
                {answers.map((a, idx) => (
                  <div key={idx} className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{a.question}</label>
                    <textarea
                      rows="2"
                      value={a.answer}
                      onChange={(e) => setAnswers((prev) => prev.map((x, i) => (i === idx ? { ...x, answer: e.target.value } : x)))}
                      className="w-full p-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center w-full h-11 gap-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition shadow-md shadow-brand-500/10"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <span>Submit application</span>}
            </button>
            <p className="text-[10px] text-slate-400 text-center">By applying you consent to your résumé being processed for this role.</p>
          </form>
        )}
      </div>
    </div>
  );
};

export default CareerApply;
