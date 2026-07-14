import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN } from '../services/api';
import { Mail, Lock, Loader2, ArrowRight, CheckCircle2, ChevronLeft } from 'lucide-react';

const Login = () => {
  const { login, forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();

  // Warm up the backend as soon as the login page loads. On free hosting
  // (e.g. Render) the server sleeps when idle and takes ~30–60s to wake; firing
  // this ping while the user types their credentials means the API is usually
  // ready by the time they hit "Sign In". Fire-and-forget; errors are ignored.
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

    const result = await login(email, password);
    setLoading(false);

    if (result && result.success) {
      navigate('/');
    } else {
      setError(result?.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setForgotLoading(true);
    setError('');
    setForgotSuccess('');

    const result = await forgotPassword(forgotEmail);
    setForgotLoading(false);

    if (result && result.success) {
      setForgotSuccess(result.message);
    } else {
      setError(result?.message || 'Failed to request reset link.');
    }
  };

  const inputStyle = 'w-full h-11 pl-10 pr-4 border text-xs tracking-wide luxury-input focus:outline-none';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-luxury-gradient text-[#1c1c1c] dark:text-[#f5efe9] font-luxury transition-colors duration-200">

      {/* Outer Card Grid */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin rounded-none overflow-hidden shadow-sm">

        {/* Left Brand Panel */}
        <div className="hidden md:flex flex-col justify-between p-10 bg-[#1c1c1c] text-white relative overflow-hidden border-r luxury-border-thin">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#c5a880_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="flex items-center space-x-3 z-10">
            <img 
              src="https://parakkatjewels.com/cdn/shop/files/Logo.png?v=1711363419&width=96" 
              alt="Parakkat Jewels Logo" 
              className="h-10 w-auto object-contain brightness-100 dark:brightness-95" 
            />
            <span className="font-luxury font-medium tracking-[0.2em] text-xs uppercase border-l luxury-border-thin pl-3 text-[#e2d1c5]">
              Recruitment
            </span>
          </div>

          <div className="space-y-4 z-10 my-auto">
            <span className="text-[9px] tracking-[0.3em] text-[#c5a880] uppercase font-bold block mb-1">
              Recruiter Access Portal
            </span>
            <h2 className="text-2xl font-light tracking-[0.18em] uppercase leading-snug">
              Enterprise Talent, <br />
              <span className="text-[#c5a880] font-normal">Layered with Pure Gold.</span>
            </h2>
            <div className="w-12 h-[1px] bg-[#c5a880] my-3"></div>
            <p className="text-[10px] text-[#e2d1c5] tracking-widest uppercase leading-relaxed max-w-sm font-light">
              Access the screening pipeline dashboard to parse, review, score, and match applicants against job requirements instantly.
            </p>
          </div>

          <div className="text-[9px] tracking-widest uppercase text-slate-500 z-10">
            &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
          </div>
        </div>

        {/* Right Auth Forms Panel */}
        <div className="p-8 md:p-10 flex flex-col justify-center bg-white/60 dark:bg-black/10">
          
          {/* Back to Careers Link */}
          <Link to="/careers" className="inline-flex items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-[#c5a880] transition-colors duration-200 mb-6">
            <ChevronLeft size={14} className="mr-1 text-[#c5a880]" /> Back to Careers
          </Link>

          {!forgotMode ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
                  Welcome back
                </h3>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">
                  Access your screening pipeline dashboard.
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-none flex items-center tracking-wide">
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email Address</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="RECRUITER@PARAKKAT.COM"
                      className={inputStyle}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
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
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
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
                        placeholder="RECRUITER@PARAKKAT.COM"
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
  );
};

export default Login;
