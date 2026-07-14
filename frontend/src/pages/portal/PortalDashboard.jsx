import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../services/portalApi';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import PortalShell, { statusPill } from './PortalShell';
import { Loader2, Briefcase, MapPin, Calendar, ChevronRight, CalendarClock, Sparkles } from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const PortalDashboard = () => {
  const { applicant } = useApplicantAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get('/applications')
      .then((res) => { if (res.data.success) setApps(res.data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalShell>
      <div className="mb-8">
        <span className="text-[9px] tracking-[0.3em] text-[#c5a880] uppercase font-bold block mb-2">Welcome back</span>
        <h1 className="text-2xl font-light uppercase tracking-[0.2em]">{applicant?.name || 'My Applications'}</h1>
        <div className="w-12 h-[1px] bg-[#c5a880] my-4" />
        <p className="text-[10px] tracking-[0.15em] text-slate-500 uppercase">Track the status of every role you've applied for.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={26} className="animate-spin text-[#c5a880]" /></div>
      ) : apps.length === 0 ? (
        <div className="text-center py-20 bg-white/30 dark:bg-black/10 border border-dashed luxury-border-thin">
          <Sparkles className="mx-auto text-[#c5a880] mb-3" size={30} />
          <h3 className="text-xs font-bold uppercase tracking-widest">No applications yet</h3>
          <p className="text-[10px] tracking-wider text-slate-400 mt-1 uppercase mb-5">Browse open roles and submit your first application.</p>
          <Link to="/careers" className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[#c5a880] hover:underline">
            <Briefcase size={12} /> Browse open positions
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {apps.map((a) => (
            <Link
              key={a._id}
              to={`/portal/applications/${a._id}`}
              className="group p-6 bg-white/80 dark:bg-[#151210]/60 border luxury-border-thin hover:border-[#c5a880] transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-bold text-[#c5a880] uppercase tracking-[0.2em]">{a.job.department || 'Parakkat Jewels'}</span>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] mt-2 group-hover:text-[#c5a880] transition-colors">{a.job.title}</h3>
                  </div>
                  <span className={`text-[9px] font-bold px-2.5 py-1 rounded-none border uppercase tracking-wider whitespace-nowrap ${statusPill(a.outcome)}`}>
                    {a.status}
                  </span>
                </div>

                {/* Progress bar (Application Received -> Decision) */}
                <div className="mt-5 flex items-center gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${a.outcome === 'negative' && i >= a.stageIndex
                        ? 'bg-rose-400/50'
                        : i <= a.stageIndex
                          ? 'bg-[#c5a880]'
                          : 'bg-slate-200 dark:bg-slate-800'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t luxury-border-thin flex items-center justify-between text-[9px] font-medium tracking-[0.15em] uppercase text-slate-400">
                <div className="flex flex-col gap-1">
                  {a.job.location && <span className="flex items-center gap-1"><MapPin size={10} className="text-[#c5a880]" /> {a.job.location}</span>}
                  <span className="flex items-center gap-1"><Calendar size={10} /> Applied {fmtDate(a.appliedAt)}</span>
                  {a.nextInterviewAt && (
                    <span className="flex items-center gap-1 text-[#c5a880]"><CalendarClock size={10} /> Interview {fmtDate(a.nextInterviewAt)}</span>
                  )}
                </div>
                <ChevronRight size={14} className="text-[#c5a880] group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
};

export default PortalDashboard;
