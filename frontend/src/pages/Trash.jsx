import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Trash2, RotateCcw, Loader2, ChevronLeft } from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const Trash = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/candidates/trash');
      if (res.data.success) setRows(res.data.data);
    } catch (err) {
      console.error('Error loading trash', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const restore = async (c) => {
    setBusyId(c._id);
    try {
      const res = await api.post(`/candidates/${c._id}/restore`);
      if (res.data.success) setRows((p) => p.filter((x) => x._id !== c._id));
    } catch (err) {
      console.error('Restore failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (c) => {
    if (!window.confirm(`Permanently delete ${c.name}? This removes the candidate and their résumé file forever — it cannot be undone.`)) return;
    setBusyId(c._id);
    try {
      const res = await api.delete(`/candidates/${c._id}/permanent`);
      if (res.data.success) setRows((p) => p.filter((x) => x._id !== c._id));
    } catch (err) {
      console.error('Permanent delete failed', err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center">
            <Trash2 size={18} className="mr-2 text-slate-400" /> Trash
          </h2>
          <p className="text-xs text-slate-500">Deleted candidates are kept here for 30 days, then permanently removed.</p>
        </div>
        <Link to="/candidates" className="text-xs font-semibold text-brand-500 hover:underline flex items-center gap-1">
          <ChevronLeft size={14} /> Back to Candidates
        </Link>
      </div>

      {loading ? (
        <div className="p-4 space-y-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <Trash2 className="text-slate-300 dark:text-slate-700 mb-3" size={38} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Trash is empty</h3>
          <p className="text-xs text-slate-400 mt-1">Deleted candidates will appear here.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark divide-y divide-slate-100 dark:divide-darkBorder">
          {rows.map((c) => (
            <div key={c._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{c.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 whitespace-nowrap">{c.jobId?.title || '—'}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {!c.email?.endsWith('@pending.local') && <span>{c.email} · </span>}
                  Deleted {fmtDate(c.deletedAt)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => restore(c)}
                  disabled={busyId === c._id}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition"
                >
                  {busyId === c._id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Restore
                </button>
                <button
                  onClick={() => purge(c)}
                  disabled={busyId === c._id}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-40 transition"
                >
                  <Trash2 size={11} /> Delete Forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Trash;
