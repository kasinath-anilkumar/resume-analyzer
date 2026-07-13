import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Sparkles, AlertCircle, X, ArrowRight } from 'lucide-react';
import { usePosterExtraction } from '../context/PosterExtractionContext';

// Floating indicator so a hiring-poster extraction stays visible (and its
// result recoverable) while the user browses other sections. The operation
// itself lives in PosterExtractionContext, so navigating away never cancels it.
const PosterExtractionWidget = () => {
  const { status, posterName, error, clear } = usePosterExtraction();
  const navigate = useNavigate();
  const location = useLocation();

  // Idle → nothing to show. On the create-job form itself the form handles its
  // own inline status/toast, so hide the floating widget there.
  if (status === 'idle') return null;
  if (location.pathname === '/jobs/new') return null;

  const isExtracting = status === 'extracting';
  const isReady = status === 'ready';
  const isError = status === 'error';

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 max-w-[90vw] bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-darkBorder/60">
        <div className="flex items-center gap-2 min-w-0">
          {isExtracting ? (
            <Loader2 size={15} className="animate-spin text-brand-500 flex-shrink-0" />
          ) : isError ? (
            <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />
          ) : (
            <Sparkles size={15} className="text-emerald-500 flex-shrink-0" />
          )}
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
            {isExtracting ? 'Reading poster…' : isReady ? 'Job details ready' : "Couldn't read poster"}
          </span>
        </div>
        {!isExtracting && (
          <button
            onClick={clear}
            className="p-1 text-slate-400 hover:text-rose-500 rounded transition flex-shrink-0"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        {posterName && <p className="text-[10px] text-slate-400 truncate">Poster: {posterName}</p>}
        {isError && <p className="text-[11px] text-rose-500 leading-relaxed">{error}</p>}
        {isExtracting && (
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
        {isReady && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">AI filled the job fields.</span>
            <button
              onClick={() => navigate('/jobs/new')}
              className="flex items-center gap-1 font-semibold text-brand-500 hover:underline"
            >
              Open form <ArrowRight size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PosterExtractionWidget;
