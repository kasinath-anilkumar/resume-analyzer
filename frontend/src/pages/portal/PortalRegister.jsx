import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import PortalShell, { luxuryInput, luxuryBtn } from './PortalShell';
import { Loader2, AlertCircle, ChevronLeft } from 'lucide-react';

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
    if (form.phone && !isValidPhoneNumber(form.phone)) return setError('Please enter a valid phone number.');
    setBusy(true);
    const res = await register({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password });
    setBusy(false);
    if (res.success) navigate('/portal/dashboard', { replace: true });
    else setError(res.message);
  };

  return (
    <PortalShell>
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center w-full">
        <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin rounded-none overflow-hidden shadow-sm">
        
        {/* Left Brand Panel */}
        <div className="hidden md:flex flex-col justify-between p-6 md:p-8 bg-[#1c1c1c] text-white relative overflow-hidden border-r luxury-border-thin">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#c5a880_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="flex items-center space-x-3 z-10">
            <img 
              src="https://parakkatjewels.com/cdn/shop/files/Logo.png?v=1711363419&width=96" 
              alt="Parakkat Jewels Logo" 
              className="h-10 w-auto object-contain brightness-100 dark:brightness-95" 
            />
            <span className="font-luxury font-medium tracking-[0.2em] text-xs uppercase border-l luxury-border-thin pl-3 text-[#e2d1c5]">
              Careers
            </span>
          </div>

          <div className="space-y-3 z-10 my-auto py-8">
            <span className="text-[9px] tracking-[0.3em] text-[#c5a880] uppercase font-bold block mb-1">
              Join Our Family
            </span>
            <h2 className="text-xl md:text-2xl font-light tracking-[0.18em] uppercase leading-snug">
              Create an Account, <br />
              <span className="text-[#c5a880] font-normal">Track Your Application.</span>
            </h2>
            <div className="w-12 h-[1px] bg-[#c5a880] my-3"></div>
            <p className="text-[10px] text-[#e2d1c5] tracking-widest uppercase leading-relaxed max-w-sm font-light">
              Build your applicant profile, upload screening documents, track interview progress, and review your status — all in one secure place.
            </p>
          </div>

          <div className="text-[9px] tracking-widest uppercase text-slate-500 z-10">
            &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
          </div>
        </div>

        {/* Top Brand Panel for Small Screens (Visible only on mobile/tablet) */}
        <div className="flex md:hidden flex-col items-center justify-center p-6 bg-[#1c1c1c] text-white relative overflow-hidden border-b luxury-border-thin text-center">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#c5a880_1px,transparent_1px)] [background-size:16px_16px]"></div>
          <img 
            src="https://parakkatjewels.com/cdn/shop/files/Logo.png?v=1711363419&width=96" 
            alt="Parakkat Jewels Logo" 
            className="h-10 w-auto object-contain brightness-100 mb-2.5" 
          />
          <h2 className="text-[10px] font-light tracking-[0.15em] uppercase">
            Create an Account, <span className="text-[#c5a880] font-normal">Track Your Application.</span>
          </h2>
        </div>

        {/* Right Form Panel */}
        <div className="p-6 md:p-8 flex flex-col justify-center bg-white/60 dark:bg-black/10">
          
          {/* Back Link */}
          <Link to="/careers" className="inline-flex items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-[#c5a880] transition-colors duration-200 mb-4">
            <ChevronLeft size={14} className="mr-1 text-[#c5a880]" /> Back to Careers
          </Link>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
                Register Account
              </h3>
              <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">
                Apply once, track everything in one portal.
              </p>
            </div>

            {error && (
              <div className="p-2.5 mb-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2 rounded-none tracking-wide">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Full Name *</label>
                <input required value={form.name} onChange={set('name')} className={luxuryInput} placeholder="JANE DOE" />
              </div>
              
              <div className="space-y-1">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email *</label>
                <input type="email" required value={form.email} onChange={set('email')} className={luxuryInput} placeholder="YOU@EMAIL.COM" />
              </div>
              
              <div className="space-y-1">
                <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Phone</label>
                <PhoneInput
                  defaultCountry="IN"
                  value={form.phone || undefined}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v || '' }))}
                  className={`luxury-phone ${form.phone && !isValidPhoneNumber(form.phone) ? 'luxury-phone-error' : ''}`}
                  placeholder="90000 00000"
                />
                {form.phone && !isValidPhoneNumber(form.phone) && (
                  <span className="text-[9px] text-rose-500 uppercase tracking-widest">Enter a valid phone number</span>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Password *</label>
                  <input type="password" required value={form.password} onChange={set('password')} className={luxuryInput} placeholder="MIN 6 CHARS" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Confirm *</label>
                  <input type="password" required value={form.confirm} onChange={set('confirm')} className={luxuryInput} placeholder="REPEAT" />
                </div>
              </div>

              <button type="submit" disabled={busy} className={`${luxuryBtn} w-full mt-1.5`}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Create Account'}
              </button>
            </form>

            <div className="pt-3 border-t luxury-border-thin text-center">
              <p className="text-[9px] uppercase tracking-widest text-slate-400">
                Already have an account?{' '}
                <Link to="/login" className="text-[#c5a880] font-semibold hover:underline">Sign in</Link>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </PortalShell>
);
};

export default PortalRegister;
