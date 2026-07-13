import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import { Lock, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { token, email, password });
      if (res.data.success) {
        setDone(true);
        setTimeout(() => navigate('/login'), 2500);
      } else {
        setError(res.data.message || 'Could not reset password.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full h-11 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-darkBg transition-colors duration-200">
      <div className="w-full max-w-md bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-3xl overflow-hidden shadow-premium dark:shadow-premium-dark p-8 md:p-10">
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Set a new password</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {email ? `For ${email}` : 'Choose a new password for your account.'}
            </p>
          </div>

          {!token && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl">
              This link is missing its reset token. Request a new reset email from the login page.
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl">{error}</div>
          )}

          {done ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs rounded-xl space-y-2">
              <div className="flex items-center space-x-2">
                <CheckCircle2 size={16} />
                <span className="font-bold">Password updated</span>
              </div>
              <p>Redirecting you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">New Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} disabled={!token} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Confirm Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" className={inputCls} disabled={!token} />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !token}
                className="flex items-center justify-center w-full h-11 space-x-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition shadow-md shadow-brand-500/10"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : (<><span>Update password</span><ArrowRight size={16} /></>)}
              </button>
            </form>
          )}

          <div className="text-center">
            <Link to="/login" className="text-xs font-semibold text-brand-500 hover:underline">Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
