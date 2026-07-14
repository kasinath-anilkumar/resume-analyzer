import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApplicantAuth } from '../context/ApplicantAuthContext';
import api, { API_ORIGIN } from '../services/api';
import { Mail, Lock, Loader2, ArrowRight, CheckCircle2, ChevronLeft } from 'lucide-react';
import PortalShell from './portal/PortalShell';

const Login = () => {
  // Shared sign-in for BOTH staff and candidates. The backend /auth/signin
  // decides which store the credentials belong to and returns a `type`; we
  // persist into the matching identity context and route accordingly. The two
  // identities never mix — a candidate receives an applicant-typed token that
  // cannot reach any recruiter route.
  const { persistSession: persistStaff } = useAuth();
  const { persistSession: persistApplicant } = useApplicantAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();

  // Warm up the backend as soon as the login page loads (free hosting sleeps).
  useEffect(() => {
    fetch(`${API_ORIGIN}/`, { mode: 'no-cors' }).catch(() => {});
  }, []);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/signin', { email, password });
      if (res.data?.success) {
        if (res.data.type === 'staff') {
          persistStaff(res.data);
          navigate('/');
        } else {
          persistApplicant(res.data);
          navigate('/portal/dashboard');
        }
      } else {
        setError(res.data?.message || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      if (!err.response) {
        setError('Could not reach the server — it may be waking up. Please try again in a few seconds.');
      } else {
        setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    setError('');
    setForgotSuccess('');
    try {
      const res = await api.post('/auth/forgot', { email: forgotEmail });
      setForgotSuccess(res.data?.message || 'If an account exists for that email, a reset link has been sent.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request reset link.');
    } finally {
      setForgotLoading(false);
    }
  };

  const inputStyle = 'w-full h-11 pl-10 pr-4 border text-xs tracking-wide luxury-input focus:outline-none';

  return (
    <PortalShell>
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center w-full">
        {/* Outer Card Grid */}
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
                Sign In
              </span>
              <h2 className="text-xl md:text-2xl font-light tracking-[0.18em] uppercase leading-snug">
                Enterprise Talent, <br />
                <span className="text-[#c5a880] font-normal">Layered with Pure Gold.</span>
              </h2>
              <div className="w-12 h-[1px] bg-[#c5a880] my-3"></div>
              <p className="text-[10px] text-[#e2d1c5] tracking-widest uppercase leading-relaxed max-w-sm font-light">
                Recruiters manage the hiring pipeline; candidates track their applications — all from one secure sign-in.
              </p>
            </div>

            <div className="text-[9px] tracking-widest uppercase text-slate-500 z-10">
              &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
            </div>
          </div>

          {/* Right Auth Forms Panel */}
          <div className="p-6 md:p-8 flex flex-col justify-center bg-white/60 dark:bg-black/10">

            {/* Back to Careers Link */}
            <Link to="/careers" className="inline-flex items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-[#c5a880] transition-colors duration-200 mb-4">
              <ChevronLeft size={14} className="mr-1 text-[#c5a880]" /> Back to Careers
            </Link>

            {!forgotMode ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
                    Welcome back
                  </h3>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">
                    Sign in to continue.
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-none flex items-center tracking-wide">
                    <span className="font-medium">{error}</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email Address</label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="YOU@EMAIL.COM"
                        className={inputStyle}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Password</label>
                      <button
                        type="button"
                        onClick={() => setForgotMode(true)}
                        className="text-[9px] font-semibold tracking-widest text-[#c5a880] hover:underline uppercase"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={inputStyle}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center w-full h-11 space-x-2 bg-[#1c1c1c] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </form>

                {/* Candidate self-registration (creates an APPLICANT account only). */}
                <div className="pt-3 border-t luxury-border-thin text-center">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400">
                    Applying for a role?{' '}
                    <Link to="/portal/register" className="text-[#c5a880] font-semibold hover:underline">Create an account</Link>
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
                    Reset password
                  </h3>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">
                    Enter your email address to receive a password reset link.
                  </p>
                </div>

                {error && (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-none tracking-wide">
                    {error}
                  </div>
                )}

                {forgotSuccess ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs rounded-none space-y-2 tracking-wide uppercase">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      <span className="font-bold">Request Sent</span>
                    </div>
                    <p className="text-[10px] leading-relaxed font-light">{forgotSuccess}</p>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email Address</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                        <input
                          type="email"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="YOU@EMAIL.COM"
                          className={inputStyle}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex items-center justify-center w-full h-11 space-x-2 bg-[#1c1c1c] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer"
                    >
                      {forgotLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <span>Send Reset Instructions</span>
                      )}
                    </button>
                  </form>
                )}

                <div className="text-center">
                  <button
                    onClick={() => {
                      setForgotMode(false);
                      setError('');
                      setForgotSuccess('');
                    }}
                    className="text-[9px] font-semibold tracking-widest text-[#c5a880] hover:underline uppercase"
                  >
                    Back to login
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </PortalShell>
  );
};

export default Login;
