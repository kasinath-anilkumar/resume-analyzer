import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  Megaphone, Loader2, Search, RefreshCw, Send, ArrowRight, FileText,
  CheckCircle2, AlertCircle, Clock, UploadCloud, Users,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

const STATUS_META = {
  awaiting: { label: 'Awaiting résumé', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  no_request: { label: 'Not requested', cls: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20' },
  analyzing: { label: 'Analyzing', cls: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20' },
  failed: { label: 'Analysis failed', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  analyzed: { label: 'Analyzed', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
};
const SOURCE_META = {
  Lead: { label: 'Meta Ad', cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  Sheet: { label: 'Sheet', cls: 'bg-brand-500/10 text-brand-600 dark:text-brand-400' },
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const StatCard = ({ label, value, tone }) => (
  <div className="p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`text-2xl font-extrabold mt-0.5 ${tone || 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
  </div>
);

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, awaiting: 0, received: 0, analyzed: 0, noRequest: 0 });
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [flash, setFlash] = useState({ type: '', text: '' });

  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const showFlash = (type, text) => { setFlash({ type, text }); setTimeout(() => setFlash({ type: '', text: '' }), 5000); };

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, jobFilter, sourceFilter, statusFilter]);

  const load = useCallback(async () => {
    try {
      const [l, j] = await Promise.all([api.get('/candidates/leads'), api.get('/jobs')]);
      if (l.data.success) { setLeads(l.data.data || []); setStats(l.data.stats || {}); }
      if (j.data.success) setJobs(j.data.data || []);
    } catch (err) {
      showFlash('error', 'Could not load leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resend = async (lead) => {
    setResendingId(lead._id);
    try {
      const res = await api.post(`/candidates/${lead._id}/resend-request`);
      showFlash('success', res.data.message || 'Request sent.');
      setLeads((prev) => prev.map((x) => (x._id === lead._id ? { ...x, leadStatus: 'awaiting', resumeRequestedAt: new Date().toISOString() } : x)));
    } catch (err) {
      showFlash('error', err.response?.data?.message || 'Could not send the request.');
    } finally {
      setResendingId(null);
    }
  };

  const sendAllRequests = async (count) => {
    if (!window.confirm(`Send the WhatsApp résumé request to ${count} lead(s) awaiting one${jobFilter ? ' for this job' : ''}? Only leads with a phone number are messaged.`)) return;
    setSendingAll(true);
    try {
      const res = await api.post('/candidates/leads/send-requests', jobFilter ? { jobId: jobFilter } : {});
      showFlash('success', res.data.message || 'Sending requests…');
      setTimeout(load, 4000); // refresh once some have been marked requested
    } catch (err) {
      showFlash('error', err.response?.data?.message || 'Could not send requests.');
    } finally {
      setSendingAll(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (jobFilter && String(l.job?._id) !== jobFilter) return false;
      if (sourceFilter && l.source !== sourceFilter) return false;
      if (statusFilter && l.leadStatus !== statusFilter) return false;
      if (q) {
        const hay = `${l.name || ''} ${l.email || ''} ${l.phone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, jobFilter, sourceFilter, statusFilter]);

  const paginatedLeads = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 size={26} className="animate-spin text-brand-500" /></div>;
  }

  // Leads (optionally scoped to the job filter) that still need a résumé — the
  // bulk-send targets exactly these (the backend scopes by jobId only).
  const awaitingCount = leads.filter(
    (l) => (!jobFilter || String(l.job?._id) === jobFilter) && (l.leadStatus === 'awaiting' || l.leadStatus === 'no_request')
  ).length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Megaphone size={20} className="text-brand-500" /> Leads
          </h2>
          <p className="text-xs text-slate-500">Everything the automation brings in — Meta Ad leads and imported sheets — with their résumé status.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition">
            <RefreshCw size={14} /> Refresh
          </button>
          {awaitingCount > 0 && (
            <button
              onClick={() => sendAllRequests(awaitingCount)}
              disabled={sendingAll}
              title="Send the WhatsApp résumé request to every lead awaiting one"
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition"
            >
              {sendingAll ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send requests ({awaitingCount})
            </button>
          )}
          <Link to="/upload" className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition">
            <UploadCloud size={14} /> Import a sheet
          </Link>
        </div>
      </div>

      {flash.text && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-[11px] font-medium border ${
          flash.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-600 border-rose-500/20'}`}>
          {flash.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{flash.text}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total leads" value={stats.total || 0} />
        <StatCard label="Awaiting résumé" value={stats.awaiting || 0} tone="text-amber-600 dark:text-amber-400" />
        <StatCard label="Résumés received" value={stats.received || 0} tone="text-brand-600 dark:text-brand-400" />
        <StatCard label="Analyzed" value={stats.analyzed || 0} tone="text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or phone…"
            className="w-full h-10 pl-9 pr-3 text-xs bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className={selectCls}>
          <option value="">All jobs</option>
          {jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={selectCls}>
          <option value="">All sources</option>
          <option value="Lead">Meta Ad</option>
          <option value="Sheet">Sheet</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All statuses</option>
          <option value="awaiting">Awaiting résumé</option>
          <option value="no_request">Not requested</option>
          <option value="analyzing">Analyzing</option>
          <option value="analyzed">Analyzed</option>
          <option value="failed">Analysis failed</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl">
          <Megaphone size={30} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{leads.length === 0 ? 'No leads yet' : 'No leads match these filters'}</p>
          <p className="text-xs text-slate-400 mt-1">
            {leads.length === 0
              ? <>Leads from Meta Ads and <Link to="/upload" className="text-brand-500 font-semibold underline">imported sheets</Link> show up here.</>
              : 'Try clearing a filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-darkBorder">
                  <th className="font-semibold px-4 py-3">Candidate</th>
                  <th className="font-semibold px-3 py-3">Source</th>
                  <th className="font-semibold px-3 py-3">Job</th>
                  <th className="font-semibold px-3 py-3">Phone</th>
                  <th className="font-semibold px-3 py-3">Status</th>
                  <th className="font-semibold px-3 py-3">Added</th>
                  <th className="font-semibold px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/60">
                {paginatedLeads.map((l) => {
                  const st = STATUS_META[l.leadStatus] || STATUS_META.no_request;
                  const src = SOURCE_META[l.source] || { label: l.source, cls: 'bg-slate-500/10 text-slate-500' };
                  const canResend = l.leadStatus === 'awaiting' || l.leadStatus === 'no_request';
                  return (
                    <tr key={l._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition">
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{l.name || '—'}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{l.email || '—'}</div>
                      </td>
                      <td className="px-3 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${src.cls}`}>{src.label}</span></td>
                      <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[160px]">{l.job?.title || '—'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{l.phone || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>
                          {l.leadStatus === 'awaiting' && <Clock size={10} />}
                          {st.label}{l.leadStatus === 'analyzed' && l.overallScore != null ? ` · ${l.overallScore}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-400 whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {canResend && (
                            <button
                              onClick={() => resend(l)}
                              disabled={resendingId === l._id}
                              title="Re-send the WhatsApp résumé request"
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 rounded-lg transition disabled:opacity-50"
                            >
                              {resendingId === l._id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                              Request
                            </button>
                          )}
                          {l.hasResume && (
                            <Link to={`/candidates/${l._id}`} title="View candidate" className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition">
                              <FileText size={12} /> View
                            </Link>
                          )}
                          <Link to={`/candidates/${l._id}`} className="p-1.5 text-slate-400 hover:text-brand-500 transition" title="Open candidate">
                            <ArrowRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {filtered.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-darkBorder/60 bg-slate-50/20 dark:bg-slate-900/10 text-xs text-slate-500">
              <span>
                Showing <strong className="text-slate-700 dark:text-slate-300">{Math.min(filtered.length, (page - 1) * PAGE_SIZE + 1)}–{Math.min(page * PAGE_SIZE, filtered.length)}</strong> of{' '}
                <strong className="text-slate-700 dark:text-slate-300">{filtered.length}</strong> lead{filtered.length === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:text-brand-500 dark:hover:text-brand-400 transition"
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <span className="text-[11px] text-slate-500 px-1">Page {page} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(filtered.length / PAGE_SIZE)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:text-brand-500 dark:hover:text-brand-400 transition"
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <Users size={12} /> Showing {filtered.length} of {leads.length} lead{leads.length === 1 ? '' : 's'}.
      </p>
    </div>
  );
};

const selectCls = 'h-10 px-3 text-xs bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

export default Leads;
