import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import PortalShell, { luxuryInput, luxuryBtn } from './PortalShell';
import { Loader2, AlertCircle } from 'lucide-react';

const PortalRegister = () => {
  const { applicant, register } = useApplicantAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Carried over when someone applies anonymously then chooses to make an account.
  const [form, setForm] = useState({ name: '', email: params.get('email') || '', phone: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (applicant) navigate('/portal/dashboard', { replace: true }); }, [applicant, navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setBusy(true);
    const res = await register({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password });
    setBusy(false);
    if (res.success) navigate('/portal/dashboard', { replace: true });
    else setError(res.message);
  };

  return (
    <PortalShell>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-light uppercase tracking-[0.2em]">Create Account</h1>
          <div className="w-12 h-[1px] bg-[#c5a880] mx-auto my-4" />
          <p className="text-[10px] tracking-[0.15em] text-slate-500 uppercase">Apply once, track everything in one place</p>
        </div>

        <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin p-8 shadow-sm">
          {error && (
            <div className="p-3 mb-5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2"><AlertCircle size={15} /> {error}</div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Full Name *</label>
              <input required value={form.name} onChange={set('name')} className={luxuryInput} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email *</label>
              <input type="email" required value={form.email} onChange={set('email')} className={luxuryInput} placeholder="you@email.com" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Phone</label>
              <input value={form.phone} onChange={set('phone')} className={luxuryInput} placeholder="+91 90000 00000" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Password *</label>
                <input type="password" required value={form.password} onChange={set('password')} className={luxuryInput} placeholder="Min 6 chars" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Confirm *</label>
                <input type="password" required value={form.confirm} onChange={set('confirm')} className={luxuryInput} placeholder="Repeat" />
              </div>
            </div>
            <button type="submit" disabled={busy} className={`${luxuryBtn} w-full mt-2`}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] tracking-widest text-slate-500 uppercase mt-6">
          Already have an account?{' '}
          <Link to="/portal/login" className="text-[#c5a880] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </PortalShell>
  );
};

export default PortalRegister;
