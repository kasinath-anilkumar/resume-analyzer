import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  Loader2, UploadCloud, CheckCircle2, AlertCircle, FileText, ArrowRight,
} from 'lucide-react';

const ACCEPT = '.pdf,.doc,.docx,.txt,.rtf,image/*';
const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB — matches the server limit

// Public résumé-upload page for a Meta lead. The token in the URL (sent to the
// applicant over WhatsApp) is the credential — no login. Uploading attaches the
// résumé to their lead record and triggers the AI analysis.
const LeadResumeUpload = () => {
  const { token } = useParams();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get(`/public/lead/${token}`)
      .then((res) => {
        if (res.data.success) {
          setLead(res.data.data);
          if (res.data.data.alreadySubmitted) setDone(true);
        } else setInvalid(true);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  const pickFile = (f) => {
    setFileErr('');
    if (!f) { setFile(null); return; }
    if (f.size > MAX_RESUME_BYTES) { setFileErr('That file is over 10 MB. Please upload a smaller résumé.'); return; }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { setFileErr('Please attach your résumé first.'); return; }
    setSubmitting(true);
    setSubmitErr('');
    try {
      const fd = new FormData();
      fd.append('resume', file);
      const res = await api.post(`/public/lead/${token}/resume`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success) setDone(true);
      else setSubmitErr(res.data.message || 'Upload failed. Please try again.');
    } catch (err) {
      setSubmitErr(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-luxury-gradient text-[#1c1c1c] dark:text-[#f5efe9] font-luxury flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-[9px] font-bold text-[#c5a880] uppercase tracking-[0.3em]">Parakkat Jewels</span>
          <h1 className="text-lg font-light uppercase tracking-[0.2em] mt-2">Careers</h1>
        </div>
        {children}
      </div>
    </div>
  );

  if (loading) {
    return <Shell><div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-[#c5a880]" /></div></Shell>;
  }

  if (invalid) {
    return (
      <Shell>
        <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8 text-center">
          <AlertCircle className="mx-auto text-[#c5a880] mb-3" size={32} />
          <h2 className="text-sm font-bold uppercase tracking-widest">Link not valid</h2>
          <p className="text-[11px] text-slate-500 mt-2 tracking-wide leading-relaxed">This résumé link is invalid or has expired. If you applied through one of our ads, please check the latest WhatsApp message from us.</p>
          <Link to="/careers" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#c5a880] mt-5 hover:underline">Browse roles <ArrowRight size={12} /></Link>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={34} />
          <h2 className="text-sm font-bold uppercase tracking-widest">Résumé received</h2>
          <p className="text-[11px] text-slate-500 mt-2 tracking-wide leading-relaxed">
            Thank you{lead?.name ? `, ${lead.name}` : ''}! Your résumé for <strong className="text-[#c5a880]">{lead?.jobTitle}</strong> is in and our team is reviewing it. We'll be in touch.
          </p>
          <Link to="/careers" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#c5a880] mt-5 hover:underline">Browse more roles <ArrowRight size={12} /></Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8">
        <p className="text-[11px] text-slate-500 tracking-wide leading-relaxed text-center mb-6">
          Hi{lead?.name ? ` ${lead.name}` : ''} — thanks for your interest in <strong className="text-[#c5a880]">{lead?.jobTitle}</strong>. Please share your résumé to complete your application.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full border border-dashed luxury-border-thin py-8 flex flex-col items-center gap-2 hover:border-[#c5a880] transition group"
          >
            {file ? <FileText size={26} className="text-[#c5a880]" /> : <UploadCloud size={26} className="text-slate-400 group-hover:text-[#c5a880]" />}
            <span className="text-[11px] tracking-widest uppercase text-slate-600 dark:text-slate-300 px-4 text-center break-all">
              {file ? file.name : 'Tap to attach your résumé'}
            </span>
            <span className="text-[9px] tracking-wide text-slate-400">PDF, DOC, DOCX · up to 10 MB</span>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
          </button>
          {fileErr && <p className="text-[10px] text-rose-500 tracking-wide text-center">{fileErr}</p>}
          {submitErr && <p className="text-[10px] text-rose-500 tracking-wide text-center">{submitErr}</p>}
          <button
            type="submit"
            disabled={submitting || !file}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#c5a880] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#b3966f] transition disabled:opacity-40"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {submitting ? 'Uploading…' : 'Submit résumé'}
          </button>
        </form>
      </div>
      <p className="text-center text-[9px] tracking-[0.2em] uppercase text-slate-400 mt-6">© {new Date().getFullYear()} Parakkat Jewels</p>
    </Shell>
  );
};

export default LeadResumeUpload;
