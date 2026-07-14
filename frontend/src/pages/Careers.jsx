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
    <div className="min-h-screen bg-luxury-gradient text-[#1c1c1c] dark:text-[#f5efe9] font-luxury flex flex-col justify-between">
      <div>
        {/* Brand Header */}
        <header className="border-b luxury-border-thin bg-white/40 dark:bg-black/20 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
            <Link to="/careers" className="flex items-center space-x-3">
              <img 
                src="https://parakkatjewels.com/cdn/shop/files/Logo.png?v=1711363419&width=96" 
                alt="Parakkat Jewels Logo" 
                className="h-10 w-auto object-contain brightness-100 dark:brightness-95 dark:contrast-125" 
              />
              <span className="font-luxury font-medium tracking-[0.2em] text-xs uppercase hidden sm:inline-block border-l luxury-border-thin pl-3 text-[#1c1c1c] dark:text-[#e2d1c5]">
                Careers
              </span>
            </Link>
            <div className="flex items-center space-x-3.5">
              <Link to="/portal/login" className="text-[9px] tracking-[0.15em] text-[#c5a880] hover:text-[#1c1c1c] dark:hover:text-white uppercase font-semibold transition-colors duration-200">
                My Applications
              </Link>
              <span className="text-slate-200 dark:text-slate-800 hidden sm:inline-block">|</span>
              <Link to="/login" className="text-[9px] tracking-[0.15em] text-slate-500 hover:text-[#c5a880] uppercase font-semibold transition-colors duration-200 hidden sm:inline-block">
                Staff Login
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <div className="relative overflow-hidden bg-[#1c1c1c] text-white border-b-2 luxury-border-gold py-16 sm:py-20">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#c5a880_1px,transparent_1px)] [background-size:16px_16px]"></div>
          <div className="max-w-5xl mx-auto px-5 relative z-10 text-center">
            <span className="text-[9px] tracking-[0.3em] text-[#c5a880] uppercase font-bold block mb-3">
              Join Our Family
            </span>
            <h1 className="text-3xl sm:text-4xl font-light tracking-[0.2em] uppercase text-white font-luxury">
              Open Positions
            </h1>
            <div className="w-12 h-[1px] bg-[#c5a880] mx-auto my-5"></div>
            <p className="text-[10px] tracking-[0.2em] text-[#e2d1c5] max-w-xl mx-auto uppercase leading-relaxed">
              Be a part of the world's premier pure gold layered jewelry brand. Discover your next career step and apply today.
            </p>
            
            {/* Search Box */}
            <div className="relative mt-8 max-w-md mx-auto">
              <Search size={14} className="absolute left-4 top-3.5 text-[#c5a880]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="SEARCH ROLES, DEPARTMENTS, LOCATIONS..."
                className="w-full h-11 pl-10 pr-4 text-[10px] tracking-widest uppercase text-white placeholder-white/30 bg-white/5 border luxury-border-thin focus:outline-none focus:border-[#c5a880] transition rounded-none"
              />
            </div>
          </div>
        </div>

        {/* Open Jobs List */}
        <div className="max-w-5xl mx-auto px-5 py-14">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={24} className="animate-spin text-[#c5a880]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white/30 dark:bg-black/10 border border-dashed luxury-border-thin rounded-none">
              <Briefcase className="mx-auto text-[#c5a880] mb-3" size={30} />
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#1c1c1c] dark:text-[#e2d1c5]">No positions open right now</h3>
              <p className="text-[10px] tracking-wider text-slate-400 mt-1 uppercase">Please check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filtered.map((j) => (
                <Link
                  key={j._id}
                  to={`/careers/${j._id}`}
                  className="group p-6 bg-white/80 dark:bg-[#151210]/60 border luxury-border-thin rounded-none hover:border-[#c5a880] dark:hover:border-[#c5a880] hover:shadow-[0_10px_30px_rgba(197,168,128,0.06)] transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-[#c5a880] uppercase tracking-[0.2em]">{j.department}</span>
                      <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <MapPin size={10} className="text-[#c5a880]" /> {j.location}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#1c1c1c] dark:text-[#f5efe9] mt-3 group-hover:text-[#c5a880] transition-colors duration-200">
                      {j.title}
                    </h3>
                    <div className="w-6 h-[1px] bg-slate-200 dark:bg-slate-800 my-3 group-hover:bg-[#c5a880] transition-colors duration-200"></div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 tracking-wide leading-relaxed">
                      {j.description}
                    </p>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t luxury-border-thin flex items-center justify-between text-[9px] font-medium tracking-[0.15em] uppercase">
                    <div className="flex items-center gap-3 text-slate-400">
                      <span className="flex items-center gap-1"><Clock size={10} /> {j.employmentType}</span>
                      {j.experience && <span className="flex items-center gap-1"><Briefcase size={10} /> {j.experience}</span>}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[#c5a880] font-semibold group-hover:translate-x-1 transition-transform duration-200">
                      View & Apply <ArrowRight size={11} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Brand Footer */}
      <footer className="text-center text-[9px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-600 border-t luxury-border-thin py-10 max-w-5xl mx-auto w-full">
        &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
      </footer>
    </div>
  );
};

export default Careers;

