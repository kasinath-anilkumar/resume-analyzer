import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, X, ArrowRight } from 'lucide-react';
import { useUpload } from '../context/UploadContext';

// Floating indicator so resume analysis stays visible while the user browses
// other sections. The queue itself lives in UploadContext, so navigating away
// never cancels an in-flight batch.
const UploadProgressWidget = () => {
  const { items, status, uploading, jobLabel, resetAll } = useUpload();
  const navigate = useNavigate();
  const location = useLocation();

  const total = items.length;
  // Nothing queued, or already viewing the full Upload page → hide the widget.
  if (total === 0 || location.pathname === '/upload') return null;

  const done = items.filter((i) => status[i.key]?.state === 'success').length;
  const errors = items.filter((i) => status[i.key]?.state === 'error').length;
  const processed = done + errors;
  const pct = total ? Math.round((processed / total) * 100) : 0;
  const finished = !uploading && processed >= total;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 max-w-[90vw]  bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-darkBorder/60">
        <div className="flex items-center gap-2 min-w-0">
          {uploading ? (
            <Loader2 size={15} className="animate-spin text-brand-500 flex-shrink-0" />
          ) : errors > 0 ? (
            <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
          )}
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
            {uploading ? 'Analyzing resumes…' : finished ? 'Analysis complete' : 'Resumes queued'}
          </span>
        </div>
        {finished && (
          <button
            onClick={resetAll}
            className="p-1 text-slate-400 hover:text-rose-500 rounded transition flex-shrink-0"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        {jobLabel && (
          <p className="text-[10px] text-slate-400 truncate">Target: {jobLabel}</p>
        )}
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${errors > 0 && finished ? 'bg-amber-500' : finished ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">
            {processed} / {total} analyzed{errors > 0 ? ` · ${errors} failed` : ''}
          </span>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-1 font-semibold text-brand-500 hover:underline"
          >
            View <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadProgressWidget;
