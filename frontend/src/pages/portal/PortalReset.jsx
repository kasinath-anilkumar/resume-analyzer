import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import PortalShell, { luxuryInput, luxuryBtn } from './PortalShell';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const PortalReset = () => {
  const { resetPassword } = useApplicantAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setBusy(true);
    const res = await resetPassword({ token, email, password: form.password });
    setBusy(false);
    if (res.success) { setDone(true); setTimeout(() => navigate('/portal/login', { replace: true }), 2500); }
    else setError(res.message);
  };

  return (
    <PortalShell>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-light uppercase tracking-[0.2em]">Set a new password</h1>
          <div className="w-12 h-[1px] bg-[#c5a880] mx-auto my-4" />
        </div>
        <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8 shadow-sm">
          {!token ? (
            <div className="text-center text-xs text-slate-500">
              <AlertCircle className="mx-auto text-[#c5a880] mb-3" size={28} />
              This reset link is missing its token. Request a new one from the sign-in page.
              <div className="mt-5"><Link to="/portal/login" className="text-[10px] uppercase tracking-widest text-[#c5a880] font-semibold hover:underline">Back to sign in</Link></div>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={30} />
              <p className="text-xs text-slate-600 dark:text-slate-300">Password updated. Redirecting to sign in…</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2"><AlertCircle size={15} /> {error}</div>}
              <div className="space-y-2">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">New Password</label>
                <input type="password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={luxuryInput} placeholder="Min 6 chars" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Confirm Password</label>
                <input type="password" required value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} className={luxuryInput} placeholder="Repeat" />
              </div>
              <button type="submit" disabled={busy} className={`${luxuryBtn} w-full mt-2`}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </PortalShell>
  );
};

export default PortalReset;
