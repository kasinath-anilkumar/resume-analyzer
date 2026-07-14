import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../services/portalApi';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import PortalShell, { statusPill } from './PortalShell';
import { Loader2, Briefcase, MapPin, Calendar, ChevronRight, CalendarClock, Sparkles, User, ExternalLink } from 'lucide-react';

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

  // Compute key metrics
  const totalApps = apps.length;
  const interviewApps = apps.filter(a => a.nextInterviewAt);
  const nextInterview = interviewApps.length > 0 
    ? [...interviewApps].sort((a, b) => new Date(a.nextInterviewAt) - new Date(b.nextInterviewAt))[0] 
    : null;

  return (
    <PortalShell>
      {/* Dashboard Top Title */}
      <div className="mb-8">
        <span className="text-[9px] tracking-[0.3em] text-[#c5a880] uppercase font-bold block mb-2">Member Portal</span>
        <h1 className="text-xl sm:text-xl md:text-2xl font-light uppercase tracking-[0.2em]">Applicant Dashboard</h1>
        <div className="w-12 h-[1px] bg-[#c5a880] my-4" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={26} className="animate-spin text-[#c5a880]" /></div>
      ) : totalApps === 0 ? (
        <div className="text-center py-20 bg-white/30 dark:bg-black/10 border border-dashed luxury-border-thin rounded-none max-w-xl mx-auto">
          <Sparkles className="mx-auto text-[#c5a880] mb-3" size={30} />
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#1c1c1c] dark:text-[#f5efe9]">No applications yet</h3>
          <p className="text-[10px] tracking-wider text-slate-400 mt-1 uppercase mb-5">Browse open roles and submit your first application.</p>
          <Link to="/careers" className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-[#1c1c1c] text-white hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[9px] tracking-widest uppercase transition-all duration-300">
            <Briefcase size={11} /> Browse open positions
          </Link>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Left Panel: Profile & Concierge Summary (35%) */}
          <div className="w-full lg:w-[35%] space-y-6 lg:sticky lg:top-24">
            
            {/* Candidate Identity Card */}
            <div className="bg-[#1c1c1c] text-white p-5 border-b-2 luxury-border-gold shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#c5a880_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border luxury-border-thin bg-white/5 flex items-center justify-center text-[#c5a880] font-light text-sm tracking-widest">
                    {applicant?.name ? applicant.name.charAt(0).toUpperCase() : 'A'}
                  </div>
                  <div>
                    <span className="text-[8px] tracking-[0.25em] text-[#c5a880] uppercase font-bold block">APPLICANT PROFILE</span>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[#e2d1c5] mt-0.5">{applicant?.name}</h2>
                  </div>
                </div>
                
                <div className="w-12 h-[1px] bg-[#c5a880]/30 my-2"></div>
                
                <div className="text-[9px] tracking-widest uppercase text-slate-400 space-y-1">
                  <div className="truncate">EMAIL: {applicant?.email}</div>
                  {applicant?.phone && <div>PHONE: {applicant.phone}</div>}
                </div>
                
                <div className="pt-2 border-t border-white/5 flex justify-end">
                  <Link to="/portal/profile" className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-[#c5a880] hover:underline">
                    Edit Profile <ChevronRight size={10} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Next Interview Widget */}
            {nextInterview ? (
              <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-5 space-y-4 shadow-sm">
                <span className="text-[9px] tracking-[0.2em] text-[#c5a880] uppercase font-bold flex items-center gap-1.5">
                  <CalendarClock size={12} /> Upcoming Interview
                </span>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1c1c1c] dark:text-[#f5efe9]">
                    {nextInterview.job.title}
                  </h4>
                  <p className="text-[10px] tracking-wide text-slate-500 uppercase leading-relaxed font-light">
                    DATE: {new Date(nextInterview.nextInterviewAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    <br />
                    TIME: {new Date(nextInterview.nextInterviewAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Link 
                  to={`/portal/applications/${nextInterview._id}`}
                  className="w-full h-9 flex items-center justify-center bg-[#1c1c1c] text-white hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[9px] tracking-widest uppercase transition-all duration-300 font-semibold"
                >
                  Join / View Details
                </Link>
              </div>
            ) : (
              <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-5 text-center shadow-sm">
                <span className="text-[9px] tracking-[0.2em] text-slate-400 uppercase font-bold block mb-1">Status Summary</span>
                <p className="text-[9px] tracking-widest text-slate-400 uppercase leading-relaxed font-light">
                  No upcoming interviews scheduled. We will contact you once the stage review completes.
                </p>
                <Link to="/careers" className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-[#c5a880] mt-4 hover:underline">
                  Browse More Positions <ChevronRight size={10} />
                </Link>
              </div>
            )}
          </div>

          {/* Right Panel: Applications Stream Index (65%) */}
          <div className="w-full lg:w-[65%] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] tracking-[0.2em] text-slate-400 uppercase font-bold block">Application List</span>
              <span className="text-[9px] tracking-[0.1em] text-slate-400 uppercase font-semibold">Total: {totalApps}</span>
            </div>
            
            <div className="space-y-4">
              {apps.map((a) => {
                return (
                  <Link
                    key={a._id}
                    to={`/portal/applications/${a._id}`}
                    className="group block bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin hover:border-[#c5a880] dark:hover:border-[#c5a880] p-5 transition-all duration-300 relative shadow-sm hover:shadow-[0_6px_20px_rgba(197,168,128,0.04)]"
                  >
                    {/* Decorative gold left-stripe on hover */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-transparent group-hover:bg-[#c5a880] transition-all duration-300"></div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left: Job Titles */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-semibold tracking-widest text-[#c5a880] uppercase">
                          {a.job.department || 'Jewelry Operations'}
                        </span>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1c1c1c] dark:text-[#f5efe9] group-hover:text-[#c5a880] transition-colors leading-tight">
                          {a.job.title}
                        </h3>
                        <div className="flex items-center gap-4 text-[9px] text-slate-400 tracking-widest uppercase pt-1 font-light">
                          {a.job.location && <span className="flex items-center gap-1"><MapPin size={9} className="text-[#c5a880]" /> {a.job.location}</span>}
                          <span className="flex items-center gap-1"><Calendar size={9} /> Applied {fmtDate(a.appliedAt)}</span>
                        </div>
                      </div>
                      
                      {/* Right: Status Pill & Action */}
                      <div className="flex items-center gap-4 self-end sm:self-center">
                        <div className="text-right">
                          <span className={`text-[8px] font-bold px-2.5 py-1 rounded-none border uppercase tracking-wider whitespace-nowrap ${statusPill(a.outcome)}`}>
                            {a.status}
                          </span>
                          {a.nextInterviewAt && (
                            <span className="text-[8.5px] font-bold text-[#c5a880] block mt-1.5 uppercase tracking-widest">
                              Interview Booked
                            </span>
                          )}
                        </div>
                        <div className="w-7 h-7 border luxury-border-thin flex items-center justify-center group-hover:border-[#c5a880] group-hover:bg-[#c5a880]/5 transition-all duration-300">
                          <ChevronRight size={13} className="text-slate-400 group-hover:text-[#c5a880] group-hover:translate-x-0.5 transition-all duration-300" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </PortalShell>
  );
};

export default PortalDashboard;
