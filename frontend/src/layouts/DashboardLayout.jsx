import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import UploadProgressWidget from '../components/UploadProgressWidget';
import PosterExtractionWidget from '../components/PosterExtractionWidget';

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
};
import {
  LayoutDashboard,
  Briefcase,
  Users,
  GitBranch,
  Columns,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  Bell,
  User,
  Plus,
  ArrowLeftRight,
  Settings,
  UploadCloud,
  UserCog,
  Sparkles,
  ScrollText
} from 'lucide-react';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = user?.role === 'Admin';

  const fetchNotifs = async () => {
    try {
      const res = await api.get('/notifications');
      if (res.data.success) {
        setNotifs(res.data.data || []);
        setUnread(res.data.unread ?? 0);
      }
    } catch (err) {
      // silent — the bell just stays empty on failure
    }
  };

  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, 45000);
    return () => clearInterval(t);
  }, []);

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (err) { /* ignore */ }
  };

  const markOne = async (n) => {
    if (n.read) return;
    try {
      await api.put(`/notifications/${n._id}/read`);
      setNotifs((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) { /* ignore */ }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['Admin', 'Recruiter', 'Hiring Manager'] },
    { name: 'Job Openings', path: '/jobs', icon: Briefcase, roles: ['Admin', 'Recruiter', 'Hiring Manager'] },
    { name: 'Upload & Analyze', path: '/upload', icon: UploadCloud, roles: ['Admin', 'Recruiter'] },
    { name: 'Candidates', path: '/candidates', icon: Users, roles: ['Admin', 'Recruiter', 'Hiring Manager'] },
    { name: 'AI Shortlist', path: '/shortlist', icon: Sparkles, roles: ['Admin', 'Recruiter', 'Hiring Manager'] },
    { name: 'Hiring Pipeline', path: '/pipeline', icon: Columns, roles: ['Admin', 'Recruiter', 'Hiring Manager'] },
    { name: 'Compare Talents', path: '/compare', icon: ArrowLeftRight, roles: ['Admin', 'Recruiter', 'Hiring Manager'] },
    { name: 'Notifications', path: '/notifications', icon: Bell, roles: ['Admin'] },
    { name: 'User Management', path: '/users', icon: UserCog, roles: ['Admin'] },
    { name: 'Audit Log', path: '/audit', icon: ScrollText, roles: ['Admin'] },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['Admin', 'Recruiter', 'Hiring Manager'] },
  ];

  const allowedNavItems = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50 dark:bg-darkBg transition-colors duration-200">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Component */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r border-slate-200 dark:border-darkBorder bg-white dark:bg-darkCard transition-transform duration-300 transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:static lg:h-screen`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-darkBorder">
          <div className="flex items-center space-x-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-md">
              <span className="text-xl font-bold tracking-tight">Ω</span>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">PARAKKAT</span>
              <span className="text-xs font-semibold text-brand-500 block -mt-1 tracking-wider uppercase">RESUME ANALYSER</span>
            </div>
          </div>
          <button className="lg:hidden text-slate-500 dark:text-slate-400" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {allowedNavItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                  ? 'bg-gradient-to-r from-brand-500/10 to-indigo-500/5 text-brand-600 dark:text-brand-400 border-l-2 border-brand-500 pl-2'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={18} className="flex-shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        {/* Upload Resume Quick Button */}
        {['Admin', 'Recruiter'].includes(user?.role) && (
          <div className="px-3 py-2.5 border-t border-slate-200 dark:border-darkBorder">
            <NavLink
              to="/upload"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-center w-full space-x-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 shadow-sm transition duration-200"
            >
              <Plus size={16} />
              <span>Upload Resume</span>
            </NavLink>
          </div>
        )}

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-100 dark:bg-slate-800 text-brand-600 dark:text-brand-400 font-bold uppercase">
                {user?.name?.slice(0, 2) || 'US'}
              </div>
              <div className="max-w-[120px]">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{user?.name}</h4>
                <p className="text-[10px] text-slate-500 truncate">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-500/15 rounded-lg transition duration-200"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between h-14 px-4 lg:px-6 bg-white dark:bg-darkCard border-b border-slate-200 dark:border-darkBorder sticky top-0 z-30">
          {/* Menu toggles */}
          <div className="flex items-center">
            <button
              className="p-2 -ml-2 lg:hidden text-slate-600 dark:text-slate-400"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="ml-4 lg:ml-0">
              {/* <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                ATS Platform
              </span> */}
              {/* <h1 className="text-sm font-bold text-slate-800 dark:text-slate-200 -mt-1 capitalize">
                {location.pathname === '/' ? 'Dashboard Analytics' : location.pathname.substring(1).replace('-', ' ')}
              </h1> */}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-3 lg:space-x-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition duration-200"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => { setNotifOpen((o) => !o); if (!notifOpen) fetchNotifs(); }}
                className="relative p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition duration-200"
                title="Notifications"
              >
                <Bell size={18} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-rose-500 rounded-full">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 mt-2.5 w-80 max-w-[90vw] bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-darkBorder/60">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Notifications</span>
                      {unread > 0 && (
                        <button onClick={markAllRead} className="text-[10px] font-semibold text-brand-500 hover:underline">Mark all read</button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-darkBorder/60">
                      {notifs.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">You're all caught up.</div>
                      ) : (
                        notifs.map((n) => (
                          <button
                            key={n._id}
                            onClick={() => markOne(n)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition ${!n.read ? 'bg-brand-500/[0.04]' : ''}`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read
                                ? <span className="mt-1 w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                                : <span className="mt-1 w-2 h-2 flex-shrink-0" />}
                              <div className="min-w-0 flex-1">
                                {n.title && <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{n.title}</p>}
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{n.message}</p>
                                <p className="text-[9.5px] text-slate-400 mt-1">{n.senderName} · {timeAgo(n.createdAt)}</p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => { setNotifOpen(false); navigate('/notifications'); }}
                        className="w-full px-4 py-2.5 text-[11px] font-semibold text-brand-500 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-t border-slate-100 dark:border-darkBorder/60"
                      >
                        Send a notification →
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-darkBorder" />

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center space-x-2 focus:outline-none"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-semibold text-xs border border-indigo-200 dark:border-indigo-800/40">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              </button>

              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 mt-2.5 w-52 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl shadow-lg py-1.5 z-50">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs text-slate-400">Signed in as</p>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/candidates');
                      }}
                      className="flex items-center w-full px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
                    >
                      <Users size={14} className="mr-2.5" />
                      Manage Applicants
                    </button>
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-left border-t border-slate-100 dark:border-slate-800"
                    >
                      <LogOut size={14} className="mr-2.5" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Dashboard Pages Mount */}
        <main className="flex-1 p-2 lg:p-3 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Global resume-analysis progress — persists across section changes */}
      <UploadProgressWidget />

      {/* Global poster-extraction progress — persists across section changes */}
      <PosterExtractionWidget />
    </div>
  );
};

export default DashboardLayout;
