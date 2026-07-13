import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN } from '../services/api';
import { Mail, Lock, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-darkBg transition-colors duration-200">

      {/* Outer Card Grid */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-3xl overflow-hidden shadow-premium dark:shadow-premium-dark">

        {/* Left Brand Panel */}
        <div className="hidden md:flex flex-col justify-between p-10 bg-gradient-to-tr from-brand-700 to-indigo-900 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

          <div className="flex items-center space-x-2.5 z-10">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 text-white font-bold text-lg">
              Ω
            </div>
            <span className="font-bold tracking-tight text-lg">PARAKKAT RESUME ANALYZER</span>
          </div>

          <div className="space-y-4 z-10 my-auto">
            <h2 className="text-3xl font-extrabold tracking-tight leading-tight">
              Enterprise Recruitment, <br />
              <span className="text-brand-300">Powered by AI.</span>
            </h2>
            <p className="text-sm text-slate-300/90 leading-relaxed max-w-sm">
              Sift, parse, score and match candidates directly against job postings in seconds using advanced LLMs and secure parsing pipelines.
            </p>
          </div>

          <div className="text-xs text-slate-400 z-10">
            &copy; 2026 PARAKKAT ATS, Inc. All rights reserved.
          </div>
        </div>

        {/* Right Auth Forms Panel */}
        <div className="p-8 md:p-10 flex flex-col justify-center">
          {!forgotMode ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Welcome back</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Access your screening pipeline dashboard.
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center">
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="recruiter@company.com"
                      className="w-full h-11 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Password</label>
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs font-medium text-brand-500 hover:underline"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center w-full h-11 space-x-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-sm transition shadow-md shadow-brand-500/10"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Reset password</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your email address and we'll send you a password reset link.
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl">
                  {error}
                </div>
              )}

              {forgotSuccess ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs rounded-xl space-y-2">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 size={16} />
                    <span className="font-bold">Request Sent</span>
                  </div>
                  <p>{forgotSuccess}</p>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Email Address</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-3 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="email@company.com"
                        className="w-full h-11 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex items-center justify-center w-full h-11 space-x-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-sm transition shadow-md shadow-brand-500/10"
                  >
                    {forgotLoading ? (
                      <Loader2 size={16} className="animate-spin" />
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
                  className="text-xs font-semibold text-brand-500 hover:underline"
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
