import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  UserPlus,
  Trash2,
  Loader2,
  ShieldCheck,
  User,
  Mail,
  Lock,
  Users as UsersIcon,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';

const ROLES = ['Admin', 'Recruiter', 'Hiring Manager'];

const roleBadgeClass = (role) => {
  if (role === 'Admin') return 'bg-brand-500/10 text-brand-600 dark:text-brand-400';
  if (role === 'Recruiter') return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
  return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
};

const Users = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Recruiter' });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const isAdmin = user?.role === 'Admin';

  // Guard: only Admins may view this page.
  useEffect(() => {
    if (user && !isAdmin) navigate('/', { replace: true });
  }, [user, isAdmin, navigate]);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 4000);
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/users');
      if (res.data.success) setUsers(res.data.data);
    } catch (err) {
      console.error('Error fetching users', err);
      showStatus('error', err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      showStatus('error', 'Name, email and password are required.');
      return;
    }
    if (form.password.length < 6) {
      showStatus('error', 'Password must be at least 6 characters.');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/auth/users', form);
      if (res.data.success) {
        setForm({ name: '', email: '', password: '', role: 'Recruiter' });
        showStatus('success', `Account created for ${res.data.data.name}.`);
        fetchUsers();
      }
    } catch (err) {
      console.error(err);
      showStatus('error', err.response?.data?.message || 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id, role) => {
    setBusyId(id);
    try {
      const res = await api.put(`/auth/users/${id}/role`, { role });
      if (res.data.success) {
        setUsers((prev) => prev.map((u) => (u._id === id ? { ...u, role } : u)));
        showStatus('success', 'Role updated.');
      }
    } catch (err) {
      console.error(err);
      showStatus('error', err.response?.data?.message || 'Failed to update role.');
      fetchUsers(); // revert to server truth
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    setBusyId(u._id);
    try {
      const res = await api.delete(`/auth/users/${u._id}`);
      if (res.data.success) {
        setUsers((prev) => prev.filter((x) => x._id !== u._id));
        showStatus('success', `${u.name} deleted.`);
      }
    } catch (err) {
      console.error(err);
      showStatus('error', err.response?.data?.message || 'Failed to delete user.');
    } finally {
      setBusyId(null);
    }
  };

  const inputClass =
    'w-full h-10 pl-9 pr-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';

  return (
    <div className="space-y-3 animate-in fade-in duration-300 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gradient-to-r from-brand-600 to-indigo-700 text-white rounded-2xl shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-1 bg-white/10 rounded-lg">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">User Management</h2>
          </div>
          <p className="text-[11px] text-brand-100 max-w-xl">
            Create accounts and assign roles. Accounts can only be created here — public sign-up is disabled.
          </p>
        </div>
        <span className="relative z-10 text-xs font-semibold bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl">
          {users.length} user{users.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        {/* Create user */}
        <div className="lg:col-span-1 p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
          <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center mb-3">
            <UserPlus size={14} className="mr-2 text-brand-500" /> Create Account
          </h3>
          <form onSubmit={handleCreate} className="space-y-2.5">
            <div className="relative">
              <User size={14} className="absolute left-3 top-3 text-slate-400" />
              <input name="name" value={form.name} onChange={handleFormChange} placeholder="Full name" className={inputClass} />
            </div>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-3 text-slate-400" />
              <input type="email" name="email" value={form.email} onChange={handleFormChange} placeholder="email@company.com" className={inputClass} />
            </div>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-3 text-slate-400" />
              <input type="password" name="password" value={form.password} onChange={handleFormChange} placeholder="Temp password (min 6 chars)" className={inputClass} />
            </div>
            <select name="role" value={form.role} onChange={handleFormChange} className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center justify-center w-full space-x-1.5 h-10 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow transition"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              <span>{creating ? 'Creating...' : 'Create Account'}</span>
            </button>
            <p className="text-[10px] text-slate-400">Share the temporary password with the user; they sign in with it.</p>
          </form>
        </div>

        {/* Users list */}
        <div className="lg:col-span-2 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark overflow-hidden">
          {loading ? (
            <div className="p-10 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-brand-500" />
            </div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400 flex flex-col items-center">
              <UsersIcon size={32} className="text-slate-300 dark:text-slate-700 mb-2" />
              No users found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-darkBorder/60 bg-slate-50/50 dark:bg-slate-900/30 text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    <th className="py-2.5 px-4">User</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/60">
                  {users.map((u) => {
                    const isSelf = u._id === user?._id;
                    return (
                      <tr key={u._id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400 uppercase">
                              {u.name?.slice(0, 2) || 'U'}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                                {u.name}{isSelf && <span className="text-[9px] font-semibold text-brand-500 ml-1.5">(you)</span>}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate block">{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          {isSelf ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full font-semibold text-[9.5px] uppercase ${roleBadgeClass(u.role)}`}>{u.role}</span>
                          ) : (
                            <select
                              value={u.role}
                              disabled={busyId === u._id}
                              onChange={(e) => handleRoleChange(u._id, e.target.value)}
                              className="h-8 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {!isSelf && (
                            <button
                              onClick={() => handleDelete(u)}
                              disabled={busyId === u._id}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition disabled:opacity-40"
                              title="Delete user"
                            >
                              {busyId === u._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bottom snackbar */}
      {status.message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs shadow-xl border bg-white dark:bg-slate-900 ${
            status.type === 'success'
              ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}>
            {status.type === 'success'
              ? <CheckCircle size={15} className="text-emerald-500 flex-shrink-0" />
              : <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />}
            <span className="font-medium flex-1">{status.message}</span>
            <button onClick={() => setStatus({ type: '', message: '' })} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
