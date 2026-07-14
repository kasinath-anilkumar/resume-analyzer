import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import PortalShell, { luxuryInput, luxuryBtn } from './PortalShell';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const PortalLogin = () => {
  const { applicant, login, forgotPassword } = useApplicantAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [notice, setNotice] = useState('');

  useEffect(() => { if (applicant) navigate('/portal/dashboard', { replace: true }); }, [applicant, navigate]);

  const submitLogin = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    const res = await login(form.email.trim(), form.password);
    setBusy(false);
    if (res.success) navigate('/portal/dashboard', { replace: true });
    else setError(res.message);
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    const res = await forgotPassword(form.email.trim());
    setBusy(false);
    if (res.success) setNotice(res.message);
    else setError(res.message);
  };

  return (
    <PortalShell>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-light uppercase tracking-[0.2em]">{mode === 'login' ? 'Sign In' : 'Reset Password'}</h1>
          <div className="w-12 h-[1px] bg-[#c5a880] mx-auto my-4" />
          <p className="text-[10px] tracking-[0.15em] text-slate-500 uppercase">
            {mode === 'login' ? 'Track your applications with Parakkat Jewels' : "We'll email you a reset link"}
          </p>
        </div>

        <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8 shadow-sm">
          {error && (
            <div className="p-3 mb-5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2"><AlertCircle size={15} /> {error}</div>
          )}
          {notice ? (
            <div className="text-center py-4">
              <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={30} />
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{notice}</p>
              <button onClick={() => { setMode('login'); setNotice(''); }} className="text-[10px] uppercase tracking-widest text-[#c5a880] font-semibold mt-5 hover:underline">Back to sign in</button>
            </div>
          ) : mode === 'login' ? (
            <form onSubmit={submitLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email</label>
                <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={luxuryInput} placeholder="you@email.com" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Password</label>
                <input type="password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={luxuryInput} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={busy} className={`${luxuryBtn} w-full mt-2`}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Sign In'}
              </button>
              <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-[9px] uppercase tracking-widest text-slate-400 hover:text-[#c5a880] w-full text-center pt-1">
                Forgot password?
              </button>
            </form>
          ) : (
            <form onSubmit={submitForgot} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email</label>
                <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={luxuryInput} placeholder="you@email.com" />
              </div>
              <button type="submit" disabled={busy} className={`${luxuryBtn} w-full mt-2`}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Send reset link'}
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-[9px] uppercase tracking-widest text-slate-400 hover:text-[#c5a880] w-full text-center pt-1">
                Back to sign in
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[10px] tracking-widest text-slate-500 uppercase mt-6">
          New here?{' '}
          <Link to="/portal/register" className="text-[#c5a880] font-semibold hover:underline">Create an account</Link>
        </p>
      </div>
    </PortalShell>
  );
};

export default PortalLogin;
