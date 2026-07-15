import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ScrollText, Loader2, ChevronLeft, ChevronRight, Filter, User } from 'lucide-react';

const ENTITY_TYPES = ['', 'user', 'candidate', 'job', 'settings', 'auth'];

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
};

const actionClass = (action = '') => {
  if (/delete|purge/.test(action)) return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
  if (/create/.test(action)) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  if (/export/.test(action)) return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
  if (/key|password|role|settings/.test(action)) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
  return 'bg-brand-500/10 text-brand-600 border-brand-500/20';
};

const roleDot = (role) =>
  role === 'Admin' ? 'bg-brand-500' : role === 'Recruiter' ? 'bg-indigo-500' : 'bg-slate-400';

const AuditLog = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 25;

  useEffect(() => {
    if (user && user.role !== 'Admin') navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (entityType) params.append('entityType', entityType);
        const res = await api.get(`/audit?${params.toString()}`);
        if (res.data.success) {
          setRows(res.data.data);
          setTotal(res.data.total);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, entityType]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center">
            <ScrollText size={18} className="mr-2 text-brand-500" /> Audit Log
          </h2>
          <p className="text-xs text-slate-500">Accountability trail — who changed what, and when.</p>
        </div>
        <div className="flex items-center space-x-2 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder px-3 py-1.5 rounded-lg shadow-sm">
          <Filter size={14} className="text-slate-400" />
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="border-none bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t || 'all'} value={t}>{t ? t[0].toUpperCase() + t.slice(1) : 'All activity'}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 size={30} className="animate-spin text-brand-500" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <ScrollText className="text-slate-300 dark:text-slate-700 mb-3" size={38} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No activity recorded yet</h3>
          <p className="text-xs text-slate-400 mt-1">Actions like user changes, deletions, and key updates will appear here.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark overflow-hidden">
          {/* Desktop Table View (Hidden on Mobile) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-darkBorder/60 bg-slate-50/50 dark:bg-slate-900/30 text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <th className="py-2.5 px-4">When</th>
                  <th className="py-2.5 px-4">Who</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/60 text-xs">
                {rows.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition">
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap" title={new Date(r.createdAt).toLocaleString()}>{timeAgo(r.createdAt)}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${roleDot(r.actorRole)}`} />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{r.actorName || 'System'}</span>
                        {r.actorRole && <span className="text-[10px] text-slate-400">({r.actorRole})</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-md border text-[9.5px] font-bold font-mono ${actionClass(r.action)}`}>{r.action}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (Hidden on Desktop) */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-darkBorder/60">
            {rows.map((r) => (
              <div key={r._id} className="p-4 space-y-2.5 hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400 font-light" title={new Date(r.createdAt).toLocaleString()}>
                    {timeAgo(r.createdAt)}
                  </span>
                  <span className={`inline-block px-2 py-0.5 rounded-md border text-[9px] font-bold font-mono ${actionClass(r.action)}`}>
                    {r.action}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${roleDot(r.actorRole)}`} />
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                    {r.actorName || 'System'}
                  </span>
                  {r.actorRole && (
                    <span className="text-[9.5px] text-slate-400">
                      ({r.actorRole})
                    </span>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                  {r.summary || '—'}
                </p>
              </div>
            ))}
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-darkBorder/60 text-[11px] text-slate-500">
            <span>{total} event{total !== 1 ? 's' : ''} · page {page} / {totalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-darkBorder disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              ><ChevronLeft size={14} /></button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-darkBorder disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              ><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
