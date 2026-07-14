import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Bell,
  Send,
  Trash2,
  Loader2,
  Users as UsersIcon,
  Shield,
  User,
  Globe,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';

const ROLES = ['Admin', 'Recruiter', 'Hiring Manager'];

const targetLabel = (n) => {
  if (n.targetType === 'all') return 'All users';
  if (n.targetType === 'role') return `${n.targetRole}s`;
  if (n.targetType === 'user') return n.targetUser?.name || n.targetUser?.email || 'A user';
  return '—';
};

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
};

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'Admin';

  const [sent, setSent] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const [form, setForm] = useState({ targetType: 'all', targetRole: 'Recruiter', targetUserId: '', title: '', message: '' });

  useEffect(() => {
    if (user && !isAdmin) navigate('/', { replace: true });
  }, [user, isAdmin, navigate]);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 4000);
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [sentRes, usersRes] = await Promise.all([
        api.get('/notifications/manage'),
        api.get('/auth/users'),
      ]);
      if (sentRes.data.success) setSent(sentRes.data.data);
      if (usersRes.data.success) setUsers(usersRes.data.data);
    } catch (err) {
      console.error('Error loading notifications', err);
      showStatus('error', err.response?.data?.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      showStatus('error', 'Message is required.');
      return;
    }
    if (form.targetType === 'user' && !form.targetUserId) {
      showStatus('error', 'Select a recipient account.');
      return;
    }
    setSending(true);
    try {
      const payload = {
        title: form.title,
        message: form.message,
        targetType: form.targetType,
        targetRole: form.targetType === 'role' ? form.targetRole : undefined,
        targetUserId: form.targetType === 'user' ? form.targetUserId : undefined,
      };
      const res = await api.post('/notifications', payload);
      if (res.data.success) {
        setForm({ targetType: 'all', targetRole: 'Recruiter', targetUserId: '', title: '', message: '' });
        showStatus('success', 'Notification sent.');
        fetchAll();
      }
    } catch (err) {
      console.error(err);
      showStatus('error', err.response?.data?.message || 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notification for everyone?')) return;
    try {
      const res = await api.delete(`/notifications/${id}`);
      if (res.data.success) {
        setSent((prev) => prev.filter((n) => n._id !== id));
      }
    } catch (err) {
      console.error(err);
      showStatus('error', err.response?.data?.message || 'Failed to delete.');
    }
  };

  const inputClass =
    'w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';
  const labelClass = 'text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider';

  const audiences = [
    { type: 'all', label: 'Everyone', icon: Globe },
    { type: 'role', label: 'By role', icon: Shield },
    { type: 'user', label: 'Account', icon: User },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gradient-to-r from-brand-600 to-indigo-700 text-white rounded-2xl shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-1 bg-white/10 rounded-lg"><Bell size={18} className="text-white" /></div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white">Notifications</h2>
          </div>
          <p className="text-[10px] sm:text-xs text-brand-100 max-w-xl">Broadcast announcements to all platform users, selected roles, or individual accounts.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Compose */}
        <div className="lg:col-span-1 p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-sm">
          <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center mb-3">
            <Send size={14} className="mr-2 text-brand-500" /> Compose Message
          </h3>
          <form onSubmit={handleSend} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className={labelClass}>Audience Selection</label>
              {/* Responsive: Stack buttons vertically on mobile, row on tablet/desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {audiences.map((a) => {
                  const Icon = a.icon;
                  const active = form.targetType === a.type;
                  return (
                    <button
                      type="button"
                      key={a.type}
                      onClick={() => setForm((prev) => ({ ...prev, targetType: a.type }))}
                      className={`flex flex-row sm:flex-col items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded-xl border text-[10px] font-semibold transition ${
                        active
                          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                          : 'border-slate-200 dark:border-darkBorder text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {form.targetType === 'role' && (
              <div className="space-y-1">
                <label className={labelClass}>Target Role</label>
                <select name="targetRole" value={form.targetRole} onChange={handleChange} className={inputClass}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {form.targetType === 'user' && (
              <div className="space-y-1">
                <label className={labelClass}>Recipient Account</label>
                <select name="targetUserId" value={form.targetUserId} onChange={handleChange} className={inputClass}>
                  <option value="">Select a user…</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{u.name} · {u.email} ({u.role})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className={labelClass}>Title (optional)</label>
              <input name="title" value={form.title} onChange={handleChange} placeholder="e.g. System maintenance" className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Message announcement</label>
              <textarea
                name="message"
                rows="4"
                value={form.message}
                onChange={handleChange}
                placeholder="Write your announcement…"
                className="w-full p-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y"
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center justify-center w-full space-x-1.5 h-10 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow transition"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>{sending ? 'Sending...' : 'Send Notification'}</span>
            </button>
          </form>
        </div>

        {/* Sent list */}
        <div className="lg:col-span-2 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-darkBorder/60 bg-slate-50/50 dark:bg-slate-900/30">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sent Broadcasts ({sent.length})</span>
          </div>
          {loading ? (
            <div className="p-10 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-brand-500" /></div>
          ) : sent.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400 flex flex-col items-center">
              <Bell size={32} className="text-slate-300 dark:text-slate-700 mb-2" />
              No notifications sent yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-darkBorder/60 max-h-[60vh] overflow-y-auto">
              {sent.map((n) => (
                <div key={n._id} className="p-4 flex items-start justify-between gap-3 hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400">
                        <UsersIcon size={11} /> {targetLabel(n)}
                      </span>
                      <span className="text-[9.5px] text-slate-400 font-medium">{timeAgo(n.createdAt)}</span>
                    </div>
                    {n.title && <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-2">{n.title}</p>}
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-2">Sent by {n.senderName} · {(n.readBy || []).length} read</p>
                  </div>
                  <button onClick={() => handleDelete(n._id)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition flex-shrink-0" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Snackbar */}
      {status.message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs shadow-xl border bg-white dark:bg-slate-900 ${
            status.type === 'success' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}>
            {status.type === 'success' ? <CheckCircle size={15} className="text-emerald-500 flex-shrink-0" /> : <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />}
            <span className="font-medium flex-1">{status.message}</span>
            <button onClick={() => setStatus({ type: '', message: '' })} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"><X size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
