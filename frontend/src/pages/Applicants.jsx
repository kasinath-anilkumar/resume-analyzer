import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Users, Loader2, Search, MapPin, FileText, ChevronRight } from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const Applicants = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/applicants')
      .then((res) => { if (res.data.success) setRows(res.data.data); })
      .catch((err) => console.error('Error loading applicants', err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = q
    ? rows.filter((a) => [a.name, a.email, a.location].join(' ').toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center">
            <Users size={18} className="mr-2 text-brand-500" /> Career Portal Users
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500">People who registered an account on the public careers portal.</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, location…"
            className="w-full sm:w-72 h-10 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-3 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl animate-pulse">
          {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <Users className="text-slate-300 dark:text-slate-700 mb-3" size={38} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">{rows.length === 0 ? 'No portal registrations yet' : 'No matches'}</h3>
          <p className="text-xs text-slate-400 mt-1">Applicants who sign up on the careers portal appear here.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-darkBorder text-[11px] font-semibold text-slate-500">
            {filtered.length} registered {filtered.length === 1 ? 'user' : 'users'}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-darkBorder">
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Contact</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4">Applications</th>
                  <th className="py-2.5 px-4">Joined</th>
                  <th className="py-2.5 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkBorder">
                {filtered.map((a) => (
                  <tr
                    key={a._id}
                    onClick={() => navigate(`/applicants/${a._id}`)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition cursor-pointer"
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                          {(a.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{a.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                      <div>{a.email}</div>
                      {a.phone && <div className="text-[10.5px] text-slate-400">{a.phone}</div>}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                      {a.location ? <span className="inline-flex items-center gap-1"><MapPin size={11} className="text-slate-400" /> {a.location}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold text-[11px]">
                        <FileText size={11} /> {a.applications}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{fmtDate(a.createdAt)}</td>
                    <td className="py-2.5 px-4 text-slate-400 text-right">
                      <ChevronRight size={14} className="inline text-slate-300 hover:text-slate-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack View */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-darkBorder/60">
            {filtered.map((a) => (
              <div
                key={a._id}
                onClick={() => navigate(`/applicants/${a._id}`)}
                className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 active:bg-slate-100 transition cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400 flex-shrink-0">
                    {(a.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block truncate">
                      {a.name}
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {a.email}
                    </span>
                    {a.phone && (
                      <span className="text-[10px] text-slate-400 block">
                        {a.phone}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {a.location && (
                        <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          <MapPin size={9} /> {a.location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md">
                        <FileText size={9} /> {a.applications} Application{a.applications === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-300 hover:text-slate-500 flex-shrink-0" />
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
};

export default Applicants;
