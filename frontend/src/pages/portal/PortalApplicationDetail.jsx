import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import portalApi from '../../services/portalApi';
import safeUrl from '../../utils/safeUrl';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import PortalShell, { statusPill } from './PortalShell';
import {
  Loader2, ChevronLeft, MapPin, Clock, Briefcase, Calendar,
  CalendarClock, Video, Building2, AlertCircle, XCircle, Ban
} from 'lucide-react';

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'To be scheduled');

const PortalApplicationDetail = () => {
  const { id } = useParams();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawErr, setWithdrawErr] = useState('');

  const fetchApp = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return portalApi.get(`/applications/${id}`)
      .then((res) => { if (res.data.success) setApp(res.data.data); else setNotFound(true); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchApp(); }, [fetchApp]);

  // Live: reflect stage moves / newly-scheduled interviews the team makes.
  // Stop once we've resolved to "not found" so we don't poll a dead id.
  useLiveRefresh(() => fetchApp(true), { pollMs: 30000, enabled: !notFound });

  const withdraw = async () => {
    if (!window.confirm('Withdraw this application? This tells the hiring team you are no longer interested and cannot be undone.')) return;
    setWithdrawing(true);
    setWithdrawErr('');
    try {
      await portalApi.post(`/applications/${id}/withdraw`);
      // Re-fetch so the status, timeline, and interview list all reflect it.
      await fetchApp(true);
    } catch (err) {
      setWithdrawErr(err.response?.data?.message || 'Could not withdraw this application. Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return <PortalShell><div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-[#c5a880]" /></div></PortalShell>;
  }
  if (notFound || !app) {
    return (
      <PortalShell>
        <div className="text-center py-20">
          <AlertCircle className="mx-auto text-[#c5a880] mb-3" size={32} />
          <h3 className="text-xs font-bold uppercase tracking-widest">Application not found</h3>
          <Link to="/portal/dashboard" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#c5a880] mt-4 hover:underline"><ChevronLeft size={13} /> Back to my applications</Link>
        </div>
      </PortalShell>
    );
  }

  const j = app.job || {};
  return (
    <PortalShell>
      <Link to="/portal/dashboard" className="inline-flex items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-[#c5a880] mb-6">
        <ChevronLeft size={14} className="mr-1 text-[#c5a880]" /> My applications
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Status + timeline */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <span className="text-[9px] font-bold text-[#c5a880] uppercase tracking-[0.25em]">{j.department || 'Parakkat Jewels'}</span>
                <h1 className="text-xl sm:text-2xl font-light uppercase tracking-widest mt-2">{j.title}</h1>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] tracking-widest uppercase text-slate-500 mt-3">
                  {j.location && <span className="flex items-center gap-1.5"><MapPin size={11} className="text-[#c5a880]" /> {j.location}</span>}
                  {j.employmentType && <span className="flex items-center gap-1.5"><Clock size={11} className="text-[#c5a880]" /> {j.employmentType}</span>}
                  <span className="flex items-center gap-1.5"><Calendar size={11} className="text-[#c5a880]" /> Applied {new Date(app.appliedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-3 py-1.5 rounded-none border uppercase tracking-wider ${statusPill(app.outcome)}`}>{app.status}</span>
            </div>

            {/* Not accepted — the upload wasn't a valid résumé/CV. */}
            {app.notAccepted && (
              <div className="mt-6 flex items-start gap-2.5 p-4 border border-rose-400/30 bg-rose-500/5">
                <AlertCircle size={16} className="text-rose-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-rose-500">Application not accepted</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 tracking-wide leading-relaxed">
                    {app.notAcceptedReason} You're welcome to <Link to="/careers" className="text-[#c5a880] underline">apply again</Link> with your résumé.
                  </p>
                </div>
              </div>
            )}

            {/* Timeline Progress Pipeline */}
            <div className="mt-8 pt-6 border-t luxury-border-thin">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.25em] block mb-6">Application Progress</span>
              
              <div className="relative pl-6 border-l luxury-border-thin ml-3 space-y-6">
                {app.timeline.map((step, i) => {
                  const negativeFinal = app.outcome === 'negative' && i === app.timeline.length - 1;
                  return (
                    <div key={i} className="relative flex items-start gap-4">
                      {/* Node circle on the vertical left line */}
                      <span className="absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center bg-white dark:bg-[#151210]">
                        {step.done ? (
                          <div className={`w-2.5 h-2.5 rounded-none rotate-45 ${negativeFinal ? 'bg-rose-500' : 'bg-[#c5a880]'}`} />
                        ) : step.current ? (
                          <div className={`w-3.5 h-3.5 border-2 ${negativeFinal ? 'border-rose-500' : 'border-[#c5a880]'} bg-white dark:bg-[#151210] flex items-center justify-center relative`}>
                            <div className={`w-1.5 h-1.5 ${negativeFinal ? 'bg-rose-500' : 'bg-[#c5a880]'} rounded-full`} />
                            <div className={`absolute w-3 h-3 ${negativeFinal ? 'bg-rose-500' : 'bg-[#c5a880]'} rounded-full animate-ping opacity-75`} />
                          </div>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-none border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#151210]" />
                        )}
                      </span>
                      
                      <div className="flex-1">
                        <span className={`text-[11px] tracking-widest uppercase font-semibold block ${step.current ? 'text-[#1c1c1c] dark:text-[#f5efe9]' : step.done ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                          {negativeFinal ? (app.withdrawn ? 'Withdrawn by you' : 'Decision — Not Selected') : step.label}
                        </span>
                        {step.done && (
                          <span className="text-[9px] tracking-wider text-slate-400 dark:text-slate-500 block mt-0.5 uppercase font-medium">Completed</span>
                        )}
                        {step.current && !negativeFinal && (
                          <span className="text-[9px] tracking-wider text-[#c5a880] block mt-0.5 uppercase font-medium animate-pulse">In Progress</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Interviews */}
          {app.interviews?.length > 0 && (
            <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5 mb-5"><CalendarClock size={13} className="text-[#c5a880]" /> Interviews</span>
              <div className="space-y-4">
                {app.interviews.map((iv, i) => (
                  <div key={i} className="p-4 border luxury-border-thin flex items-start gap-3 bg-white/50 dark:bg-black/10">
                    {iv.mode === 'Online' ? <Video size={16} className="text-[#c5a880] mt-0.5" /> : <Building2 size={16} className="text-[#c5a880] mt-0.5" />}
                    <div className="flex-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide">{iv.stage}</span>
                        <span className="text-[10px] tracking-widest uppercase text-[#c5a880]">{fmtDateTime(iv.scheduledAt)}</span>
                      </div>
                      <div className="text-[10px] tracking-wide text-slate-500 mt-1 space-y-0.5">
                        {iv.mode && <div className="uppercase">{iv.mode}</div>}
                        {iv.locationOrLink && (iv.mode === 'Online' && safeUrl(iv.locationOrLink)
                          ? <a href={safeUrl(iv.locationOrLink)} target="_blank" rel="noreferrer" className="text-[#c5a880] hover:underline break-all">{iv.locationOrLink}</a>
                          : <div className="break-all">{iv.locationOrLink}</div>)}
                        {iv.interviewer && <div>With {iv.interviewer}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Role summary */}
        <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8 lg:sticky lg:top-24">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5 mb-4"><Briefcase size={12} className="text-[#c5a880]" /> About this role</span>
          <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-loose tracking-wide whitespace-pre-line font-light">
            {j.description || 'Role details are available on the careers page.'}
          </p>
          <Link to="/careers" className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[#c5a880] mt-6 hover:underline">
            <Briefcase size={12} /> Browse more roles
          </Link>

          {/* Withdraw — only while the application is still open */}
          <div className="mt-8 pt-6 border-t luxury-border-thin">
            {app.withdrawn ? (
              <div className="flex items-start gap-2 text-[10px] tracking-wide uppercase text-slate-500">
                <Ban size={13} className="text-rose-500 mt-0.5 shrink-0" />
                <span>You withdrew this application{app.withdrawnAt ? ` on ${new Date(app.withdrawnAt).toLocaleDateString()}` : ''}.</span>
              </div>
            ) : app.canWithdraw ? (
              <>
                <button
                  onClick={withdraw}
                  disabled={withdrawing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-rose-400/40 text-rose-500 hover:bg-rose-500/10 text-[10px] font-bold uppercase tracking-widest transition disabled:opacity-40"
                >
                  {withdrawing ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                  {withdrawing ? 'Withdrawing…' : 'Withdraw application'}
                </button>
                {withdrawErr && <p className="text-[10px] text-rose-500 mt-2 tracking-wide">{withdrawErr}</p>}
                <p className="text-[9px] text-slate-400 mt-2 tracking-wide leading-relaxed">Let the team know you're no longer pursuing this role. This can't be undone.</p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </PortalShell>
  );
};

export default PortalApplicationDetail;
