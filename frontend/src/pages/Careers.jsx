import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Briefcase, MapPin, Clock, ArrowRight, Loader2, Search } from 'lucide-react';

const Careers = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/public/jobs')
      .then((res) => { if (res.data.success) setJobs(res.data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = q
    ? jobs.filter((j) =>
        [j.title, j.department, j.location].join(' ').toLowerCase().includes(q.toLowerCase())
      )
    : jobs;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg text-slate-900 dark:text-slate-200">
      {/* Header / hero */}
      <div className="bg-gradient-to-tr from-brand-700 to-indigo-900 text-white">
        <div className="max-w-5xl mx-auto px-5 py-14">
          <div className="flex items-center space-x-2.5 mb-8">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 font-bold text-lg">Ω</div>
            <span className="font-bold tracking-tight">PARAKKAT</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Open Positions</h1>
          <p className="text-sm text-brand-100 mt-2 max-w-xl">
            Join our team. Browse current openings and apply in minutes — just attach your résumé.
          </p>
          <div className="relative mt-6 max-w-md">
            <Search size={16} className="absolute left-3.5 top-3.5 text-white/60" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search roles, teams, locations…"
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
        </div>
      </div>

      {/* Listing */}
      <div className="max-w-5xl mx-auto px-5 py-10">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={30} className="animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="mx-auto text-slate-300 dark:text-slate-700 mb-3" size={40} />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No open positions right now</h3>
            <p className="text-xs text-slate-400 mt-1">Please check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((j) => (
              <Link
                key={j._id}
                to={`/careers/${j._id}`}
                className="group p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark hover:-translate-y-0.5 hover:border-brand-300 dark:hover:border-brand-700 transition"
              >
                <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">{j.department}</span>
                <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-brand-600">{j.title}</h3>
                <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><MapPin size={12} /> {j.location}</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {j.employmentType}</span>
                  {j.experience && <span className="flex items-center gap-1"><Briefcase size={12} /> {j.experience}</span>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 line-clamp-2">{j.description}</p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 mt-4">
                  View & Apply <ArrowRight size={13} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-slate-400 pb-10">&copy; 2026 PARAKKAT. All rights reserved.</div>
    </div>
  );
};

export default Careers;
