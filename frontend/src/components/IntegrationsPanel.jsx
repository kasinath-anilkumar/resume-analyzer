import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  Loader2, Plug, CheckCircle2, AlertCircle, RefreshCw, Save, Link2, MessageCircle,
  ShieldCheck, Info,
} from 'lucide-react';

// Admin panel: Meta Lead Ads + WhatsApp integration. Self-contained (fetches its
// own settings status + jobs). Tokens are write-only — the server returns only a
// masked hint + a "configured" boolean, never the raw value.
const IntegrationsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState(null); // masked settings view
  const [jobs, setJobs] = useState([]);
  const [forms, setForms] = useState(null); // null = not loaded yet
  const [busy, setBusy] = useState('');     // which action is in flight
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Editable inputs (tokens are write-only; blank = leave unchanged)
  const [metaToken, setMetaToken] = useState('');
  const [metaPageId, setMetaPageId] = useState('');
  const [metaGraphVersion, setMetaGraphVersion] = useState('v21.0');
  const [waToken, setWaToken] = useState('');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waTemplate, setWaTemplate] = useState('');

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 6000); };

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([api.get('/settings'), api.get('/jobs')]);
      if (s.data.success) {
        const d = s.data.data;
        setCfg(d);
        setMetaPageId(d.metaPageId || '');
        setMetaGraphVersion(d.metaGraphVersion || 'v21.0');
        setWaPhoneId(d.whatsappPhoneNumberId || '');
        setWaTemplate(d.whatsappTemplateName || '');
      }
      if (j.data.success) setJobs(j.data.data || []);
    } catch {
      flash('error', 'Could not load integration settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveMeta = async () => {
    setBusy('saveMeta');
    try {
      const payload = { metaPageId, metaGraphVersion };
      if (metaToken.trim()) payload.metaAccessToken = metaToken.trim();
      const res = await api.put('/settings', payload);
      if (res.data.success) { setMetaToken(''); flash('success', 'Meta credentials saved.'); await load(); }
    } catch (err) { flash('error', err.response?.data?.message || 'Save failed.'); }
    finally { setBusy(''); }
  };

  const saveWa = async () => {
    setBusy('saveWa');
    try {
      const payload = { whatsappPhoneNumberId: waPhoneId, whatsappTemplateName: waTemplate };
      if (waToken.trim()) payload.whatsappAccessToken = waToken.trim();
      const res = await api.put('/settings', payload);
      if (res.data.success) { setWaToken(''); flash('success', 'WhatsApp settings saved.'); await load(); }
    } catch (err) { flash('error', err.response?.data?.message || 'Save failed.'); }
    finally { setBusy(''); }
  };

  const testMeta = async () => {
    setBusy('test');
    try {
      const res = await api.post('/integrations/meta/test');
      flash(res.data.success ? 'success' : 'error', res.data.message);
    } catch (err) { flash('error', err.response?.data?.message || 'Connection test failed.'); }
    finally { setBusy(''); }
  };

  const loadForms = async () => {
    setBusy('forms');
    try {
      const res = await api.get('/integrations/meta/forms');
      if (res.data.success) { setForms(res.data.data || []); if (!res.data.data?.length) flash('info', 'No lead forms found on this Page.'); }
    } catch (err) { flash('error', err.response?.data?.message || 'Could not load lead forms.'); }
    finally { setBusy(''); }
  };

  const mapForm = async (jobId, formId) => {
    setBusy(`map:${jobId}`);
    try {
      const res = await api.post('/integrations/meta/map', { jobId, formId: formId || null });
      if (res.data.success) { flash('success', formId ? 'Form linked.' : 'Form unlinked.'); await load(); }
    } catch (err) { flash('error', err.response?.data?.message || 'Mapping failed.'); }
    finally { setBusy(''); }
  };

  const syncNow = async () => {
    setBusy('sync');
    try {
      const res = await api.post('/integrations/meta/sync');
      flash(res.data.success ? 'success' : 'error', res.data.message);
      await load();
    } catch (err) { flash('error', err.response?.data?.message || 'Sync failed.'); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Prerequisite note */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          This needs a Meta developer App with the <strong>leads_retrieval</strong> and <strong>whatsapp_business_messaging</strong> permissions
          (App Review + Business Verification), the Page's Lead-Gen ToS accepted, and an approved WhatsApp template with 3 body
          variables: <em>{'{{1}}'} name</em>, <em>{'{{2}}'} role</em>, <em>{'{{3}}'} upload link</em>. Until then, use Meta's Lead Ads Testing Tool + a WhatsApp test number.
        </span>
      </div>

      {msg.text && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-[11px] font-medium border ${
          msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            : msg.type === 'error' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
              : 'bg-brand-500/10 text-brand-600 border-brand-500/20'}`}>
          {msg.type === 'success' ? <CheckCircle2 size={14} /> : msg.type === 'error' ? <AlertCircle size={14} /> : <Info size={14} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Meta connection */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Plug size={14} className="text-brand-500" /> Meta Lead Ads</h3>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${cfg?.metaConfigured ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-500'}`}>
            {cfg?.metaConfigured ? 'Connected' : 'Not configured'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Page access token" hint={cfg?.metaTokenMasked ? `Saved: ${cfg.metaTokenMasked} — leave blank to keep` : 'leads_retrieval Page token'}>
            <input type="password" value={metaToken} onChange={(e) => setMetaToken(e.target.value)} placeholder="EAAG…" className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Page ID">
            <input value={metaPageId} onChange={(e) => setMetaPageId(e.target.value)} placeholder="1234567890" className={inputCls} />
          </Field>
          <Field label="Graph API version">
            <input value={metaGraphVersion} onChange={(e) => setMetaGraphVersion(e.target.value)} placeholder="v21.0" className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={saveMeta} disabled={busy === 'saveMeta'} className={btnPrimary}>
            {busy === 'saveMeta' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
          </button>
          <button onClick={testMeta} disabled={busy === 'test' || !cfg?.metaConfigured} className={btnGhost}>
            {busy === 'test' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Test connection
          </button>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"><MessageCircle size={14} className="text-emerald-500" /> WhatsApp résumé request</h3>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${cfg?.whatsappConfigured ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-500'}`}>
            {cfg?.whatsappConfigured ? 'Ready' : 'Not configured'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="WhatsApp access token" hint={cfg?.whatsappTokenMasked ? `Saved: ${cfg.whatsappTokenMasked} — leave blank to keep` : 'may equal the Meta token'}>
            <input type="password" value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder="EAAG…" className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Phone number ID">
            <input value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} placeholder="1234567890" className={inputCls} />
          </Field>
          <Field label="Approved template name">
            <input value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)} placeholder="resume_request" className={inputCls} />
          </Field>
        </div>
        <button onClick={saveWa} disabled={busy === 'saveWa'} className={`${btnPrimary} mt-3`}>
          {busy === 'saveWa' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
        </button>
      </div>

      {/* Form → Job mapping */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Link2 size={14} className="text-brand-500" /> Lead form → Job mapping</h3>
          <button onClick={loadForms} disabled={busy === 'forms' || !cfg?.metaConfigured} className={btnGhost}>
            {busy === 'forms' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Load forms
          </button>
        </div>
        {forms === null ? (
          <p className="text-[11px] text-slate-400">Load your Page's lead forms, then map each to the job its applicants should land under.</p>
        ) : forms.length === 0 ? (
          <p className="text-[11px] text-slate-400">No lead forms found on this Page.</p>
        ) : (
          <div className="space-y-2">
            {forms.map((f) => {
              const linkedJob = jobs.find((j) => j.metaFormId === f.id);
              return (
                <div key={f.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-xl border border-slate-200/70 dark:border-darkBorder/70 bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{f.name}</div>
                    <div className="text-[9px] text-slate-400">Form {f.id}{f.status ? ` · ${f.status}` : ''}</div>
                  </div>
                  <select
                    value={linkedJob?._id || ''}
                    onChange={(e) => {
                      const jobId = e.target.value;
                      if (jobId) mapForm(jobId, f.id);        // link this form to the chosen job
                      else if (linkedJob) mapForm(linkedJob._id, null); // unlink
                    }}
                    disabled={busy.startsWith('map:')}
                    className="text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 max-w-[220px]"
                  >
                    <option value="">— not linked —</option>
                    {jobs.map((j) => (
                      <option key={j._id} value={j._id} disabled={j.metaFormId && j.metaFormId !== f.id}>
                        {j.title}{j.metaFormId && j.metaFormId !== f.id ? ' (linked elsewhere)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sync */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Sync leads</h3>
          <p className="text-[11px] text-slate-400">
            Runs automatically every ~5 min. Last sync: {cfg?.metaLastSyncedAt ? new Date(cfg.metaLastSyncedAt).toLocaleString() : 'never'}.
          </p>
        </div>
        <button onClick={syncNow} disabled={busy === 'sync' || !cfg?.metaConfigured} className={btnPrimary}>
          {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync now
        </button>
      </div>
    </div>
  );
};

const inputCls = 'w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30';
const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 transition';
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder hover:text-brand-500 disabled:opacity-40 transition';

const Field = ({ label, hint, children }) => (
  <div>
    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">{label}</label>
    {children}
    {hint && <p className="text-[9px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

export default IntegrationsPanel;
