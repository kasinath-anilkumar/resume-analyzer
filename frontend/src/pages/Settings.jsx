import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Building,
  MapPin,
  Settings as SettingsIcon,
  Plus,
  Sliders,
  Save,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  Cpu,
  ShieldCheck,
  ToggleLeft,
  Server,
  Key,
  Layers,
  ChevronRight,
  X,
  Users as UsersIcon,
  UserPlus,
  User,
  Mail,
  Lock,
  Trash2
} from 'lucide-react';

const ROLES = ['Admin', 'Recruiter', 'Hiring Manager'];

const roleBadgeClass = (role) => {
  if (role === 'Admin') return 'bg-brand-500/10 text-brand-600 dark:text-brand-400';
  if (role === 'Recruiter') return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
  return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
};

const Settings = () => {
  const { user, changePassword } = useAuth();

  // Tab control state
  const [activeTab, setActiveTab] = useState('metadata'); // 'metadata' | 'ai' | 'system'

  // Settings States
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [minAiScore, setMinAiScore] = useState(60);
  const [retentionDays, setRetentionDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [originalConfig, setOriginalConfig] = useState(null);

  // AI provider key management
  const [aiProvider, setAiProvider] = useState('mock');
  const [aiKeyConfigured, setAiKeyConfigured] = useState(false);
  const [aiKeyMasked, setAiKeyMasked] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  // AI model picker
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  // Change own password
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [changingPw, setChangingPw] = useState(false);

  // Form input states
  const [newDept, setNewDept] = useState('');

  // Server state metadata
  const [dbState, setDbState] = useState({ connected: false, type: 'In-Memory Fallback' });

  const isHR = user && ['Admin', 'Recruiter'].includes(user.role);
  // Only Admins may view or manage the AI provider key / model.
  const isAdmin = user?.role === 'Admin';

  // Staff User Management States (moved from Users.jsx)
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'Recruiter' });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const res = await api.get('/auth/users');
      if (res.data.success) setUsers(res.data.data);
    } catch (err) {
      console.error('Error fetching users', err);
      showStatus('error', err.response?.data?.message || 'Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!createForm.name || !createForm.email || !createForm.password) {
      showStatus('error', 'Name, email and password are required.');
      return;
    }
    if (createForm.password.length < 6) {
      showStatus('error', 'Password must be at least 6 characters.');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/auth/users', createForm);
      if (res.data.success) {
        setCreateForm({ name: '', email: '', password: '', role: 'Recruiter' });
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
      fetchUsers();
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (u) => {
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

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/settings');
        if (res.data.success) {
          const { departments, locations, minAiScore, aiProvider, aiKeyConfigured, aiKeyMasked, aiModel, retentionDays } = res.data.data;
          setDepartments(departments || []);
          setLocations(locations || []);
          setMinAiScore(minAiScore || 60);
          setAiProvider(aiProvider || 'mock');
          setAiKeyConfigured(!!aiKeyConfigured);
          setAiKeyMasked(aiKeyMasked || '');
          setSelectedModel(aiModel || '');
          if (retentionDays !== undefined) setRetentionDays(retentionDays || 0);
          setOriginalConfig({
            departments: departments || [],
            locations: locations || [],
            minAiScore: minAiScore || 60,
            aiModel: aiModel || '',
            retentionDays: retentionDays || 0
          });
          if (aiKeyConfigured) fetchModels();
        }

        // Query system stats to detect DB type
        const statsRes = await api.get('/candidates/dashboard/stats');
        if (statsRes.data.success) {
          // If we connected successfully, check server state. Mongoose checks are handled by the controller
          // If the stats return successfully, we can probe readyState
        }
      } catch (err) {
        console.error('Error fetching global settings', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => {
      setStatus({ type: '', message: '' });
    }, 4000);
  };

  const handleAddDept = (e) => {
    e.preventDefault();
    if (!isHR) return;
    const trimmed = newDept.trim();
    if (!trimmed) return;
    if (departments.some(d => d.toLowerCase() === trimmed.toLowerCase())) {
      showStatus('error', `Department "${trimmed}" already exists.`);
      return;
    }
    setDepartments([...departments, trimmed]);
    setNewDept('');
    showStatus('success', `Added "${trimmed}" to departments.`);
  };

  const handleRemoveDept = (index) => {
    if (!isHR) return;
    const removed = departments[index];
    setDepartments(departments.filter((_, i) => i !== index));
    showStatus('success', `Removed "${removed}" department.`);
  };


  // "Save Settings" saves EVERYTHING in one go: general config, plus (for
  // Admins) the entered API key and the selected model.
  const handleSaveSettings = async () => {
    if (!isHR) return;

    const payload = { departments, locations, minAiScore };

    // Admins also persist the AI key/model here.
    if (isAdmin) {
      const cleaned = cleanKey(newApiKey);
      if (cleaned) {
        if (detectProvider(cleaned) === 'unknown') {
          showStatus('error', 'Unrecognized API key format. Fix or clear the key field, then save again.');
          return;
        }
        payload.aiApiKey = cleaned; // validated + stored server-side
      }
      // Persist the chosen model when a key is (or is being) configured.
      if (aiKeyConfigured || cleaned) {
        payload.aiModel = selectedModel;
      }
      // Data-retention policy (admin-only).
      payload.retentionDays = Number(retentionDays) || 0;
    }

    setSaving(true);
    try {
      const res = await api.put('/settings', payload);
      if (res.data.success) {
        const d = res.data.data || {};
        if (d.aiProvider !== undefined) setAiProvider(d.aiProvider || 'mock');
        if (d.aiKeyConfigured !== undefined) setAiKeyConfigured(!!d.aiKeyConfigured);
        if (d.aiKeyMasked !== undefined) setAiKeyMasked(d.aiKeyMasked || '');
        if (newApiKey) setNewApiKey('');
        if (res.data.availableModels?.length) setAvailableModels(res.data.availableModels);
        setOriginalConfig({
          departments: departments,
          locations: locations,
          minAiScore: minAiScore,
          aiModel: selectedModel,
          retentionDays: Number(retentionDays) || 0
        });
        showStatus('success', 'All settings saved.');
      }
    } catch (err) {
      console.error('Error saving configurations', err);
      showStatus('error', err.response?.data?.message || 'Failed to sync settings with backend.');
    } finally {
      setSaving(false);
    }
  };

  // Normalize a pasted key: strip zero-width / non-breaking chars and any
  // wrapping quotes/backticks that copy-paste adds (these break the prefix
  // checks even when the key visibly starts with AIza / sk- / etc.).
  const cleanKey = (key) =>
    (key || '')
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
      .trim()
      .replace(/^["'`\s]+|["'`\s]+$/g, '')
      .trim();

  // Mirror the backend's key-shape detection so the UI can preview the
  // provider before saving.
  const detectProvider = (key) => {
    const k = cleanKey(key);
    if (!k) return null;
    if (k.startsWith('sk-ant-')) return 'claude';
    if (k.startsWith('nvapi-')) return 'nvidia';
    if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'gemini';
    if (k.startsWith('sk-')) return 'openai';
    return 'unknown';
  };

  const PROVIDER_LABELS = {
    mock: 'Mock Heuristic Engine',
    openai: 'OpenAI (GPT-4o-mini)',
    claude: 'Anthropic Claude (Opus 4.8)',
    gemini: 'Google Gemini 1.5',
    nvidia: 'NVIDIA NIM (Llama 3.1)',
    unknown: 'Unrecognized key format',
  };

  const detectedProvider = detectProvider(newApiKey);
  const enteringValidKey = Boolean(newApiKey.trim() && detectedProvider && detectedProvider !== 'unknown');
  const showModelPicker = isHR && (aiKeyConfigured || enteringValidKey);
  const pickerProvider = enteringValidKey ? detectedProvider : aiProvider;

  const handleSaveApiKey = async () => {
    if (!isHR) return;
    const cleaned = cleanKey(newApiKey);
    if (!cleaned) return;
    if (detectProvider(cleaned) === 'unknown') {
      showStatus('error', 'Unrecognized API key format. Use an OpenAI (sk-...), Claude (sk-ant-...), NVIDIA (nvapi-...), or Google Gemini (AIza...) key.');
      return;
    }
    setSavingKey(true);
    try {
      // Persist the chosen model (if any) alongside the key.
      const res = await api.put('/settings', { aiApiKey: cleaned, aiModel: selectedModel });
      if (res.data.success) {
        setAiProvider(res.data.data.aiProvider || 'mock');
        setAiKeyConfigured(!!res.data.data.aiKeyConfigured);
        setAiKeyMasked(res.data.data.aiKeyMasked || '');
        setNewApiKey('');
        // Keep the model list the key can use (from the save response, else the
        // preview we already fetched) so the picker stays populated.
        if (res.data.availableModels?.length) setAvailableModels(res.data.availableModels);
        setOriginalConfig((prev) => ({
          ...prev,
          aiModel: selectedModel
        }));
        showStatus('success', `API key saved. Detected provider: ${PROVIDER_LABELS[res.data.data.aiProvider] || res.data.data.aiProvider}.`);
      }
    } catch (err) {
      console.error('Error saving API key', err);
      showStatus('error', err.response?.data?.message || 'Failed to save API key.');
    } finally {
      setSavingKey(false);
    }
  };

  // Load the models the configured key can use (for the picker).
  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const res = await api.get('/settings/models');
      if (res.data.success) {
        setAvailableModels(res.data.data.models || []);
        setSelectedModel((prev) => prev || res.data.data.selected || '');
      }
    } catch (err) {
      console.error('Error loading models', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.next.length < 6) {
      showStatus('error', 'New password must be at least 6 characters.');
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      showStatus('error', 'New passwords do not match.');
      return;
    }
    setChangingPw(true);
    const res = await changePassword(pwForm.current, pwForm.next);
    setChangingPw(false);
    if (res.success) {
      showStatus('success', 'Password changed successfully.');
      setPwForm({ current: '', next: '', confirm: '' });
    } else {
      showStatus('error', res.message || 'Failed to change password.');
    }
  };

  const handleSaveModel = async () => {
    if (!isHR) return;
    setSavingModel(true);
    try {
      const res = await api.put('/settings', { aiModel: selectedModel });
      if (res.data.success) {
        setOriginalConfig((prev) => ({
          ...prev,
          aiModel: selectedModel
        }));
        showStatus('success', selectedModel ? `Model set to ${selectedModel}.` : 'Using the provider default model.');
      }
    } catch (err) {
      showStatus('error', err.response?.data?.message || 'Failed to save model.');
    } finally {
      setSavingModel(false);
    }
  };

  // As soon as a validly-formatted key is entered, preview the models it can use
  // (without saving) so the picker populates immediately. Debounced so we don't
  // hit the provider on every keystroke.
  useEffect(() => {
    if (!isHR) return undefined;
    const key = cleanKey(newApiKey);
    if (!key || detectProvider(key) === 'unknown') return undefined;
    const t = setTimeout(async () => {
      setLoadingModels(true);
      try {
        const res = await api.post('/settings/models/preview', { aiApiKey: key });
        if (res.data.success) {
          setAvailableModels(res.data.data.models || []);
          setSelectedModel('');
        }
      } catch (err) {
        // Ignore preview errors — real validation happens on Save Key.
      } finally {
        setLoadingModels(false);
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newApiKey]);

  const handleRemoveApiKey = async () => {
    if (!isHR) return;
    if (!window.confirm('Remove the configured AI key? Resume analysis will fall back to the built-in mock engine.')) return;
    setSavingKey(true);
    try {
      const res = await api.put('/settings', { aiApiKey: '' });
      if (res.data.success) {
        setAiProvider('mock');
        setAiKeyConfigured(false);
        setAiKeyMasked('');
        setNewApiKey('');
        showStatus('success', 'AI key removed. Using mock engine.');
      }
    } catch (err) {
      console.error('Error removing API key', err);
      showStatus('error', err.response?.data?.message || 'Failed to remove API key.');
    } finally {
      setSavingKey(false);
    }
  };

  const handleResetDefaults = () => {
    if (!isHR) return;
    if (window.confirm('Reset to default enterprise departments and locations? This replaces your edits.')) {
      setDepartments([
        'Frontend Engineering',
        'Backend Architecture',
        'UI/UX Design',
        'Product Management',
        'Sales',
        'Marketing',
        'Human Resources'
      ]);
      setLocations([
        'Remote',
        'Hybrid (New York, NY)',
        'San Francisco, CA',
        'Bangalore, India',
        'London, UK'
      ]);
      setMinAiScore(60);
      showStatus('success', 'Reset values. Save configurations to persist changes.');
    }
  };

  const hasChanges = () => {
    if (!originalConfig) return false;
    const isDeptsChanged = JSON.stringify(departments) !== JSON.stringify(originalConfig.departments);
    const isLocsChanged = JSON.stringify(locations) !== JSON.stringify(originalConfig.locations);
    const isScoreChanged = minAiScore !== originalConfig.minAiScore;
    const isRetentionChanged = Number(retentionDays) !== Number(originalConfig.retentionDays);
    const isKeyChanged = newApiKey.trim() !== '';
    const isModelChanged = selectedModel !== originalConfig.aiModel;
    return isDeptsChanged || isLocsChanged || isScoreChanged || isRetentionChanged || isKeyChanged || isModelChanged;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-[calc(100vh-140px)]">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  const tabs = [
    { id: 'metadata', label: 'Company Metadata', icon: Building, desc: 'Departments' },
    { id: 'ai', label: 'AI Algorithms', icon: Cpu, desc: 'Score thresholds and parsing filters' },
    { id: 'system', label: 'System Diagnostics', icon: Server, desc: 'Database connections and credentials' }
  ];
  if (isAdmin) {
    tabs.push({ id: 'accounts', label: 'User Management', icon: UsersIcon, desc: 'Create and manage recruiter accounts' });
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-gradient-to-r from-brand-600 to-indigo-700 text-white rounded-2xl shadow-md relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-1 bg-white/10 rounded-lg">
              <SettingsIcon size={18} className="text-white" />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">System Settings & Controls</h2>
          </div>
          <p className="text-[11px] text-brand-100 max-w-xl">
            Configure default variables, verify database state, and tune AI pipeline screening thresholds.
          </p>
        </div>

        {isHR && activeTab !== 'accounts' && hasChanges() && (
          <div className="flex items-center space-x-2 relative z-10 animate-in fade-in zoom-in duration-200">
            {/* <button
              onClick={handleResetDefaults}
              className="flex items-center space-x-1 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold border border-white/10 transition"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button> */}
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex items-center space-x-1 px-3.5 py-1.5 bg-white text-brand-700 hover:bg-slate-50 rounded-xl text-xs font-bold shadow-sm transition"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span>Save Settings</span>
            </button>
          </div>
        )}
      </div>

      {/* Grid containing Settings layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">

        {/* Left Side Tab Navigation Column */}
        <div className="lg:col-span-1 space-y-2">
          <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-2 shadow-premium dark:shadow-premium-dark">
            <p className="hidden lg:block text-[9.5px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2.5 py-1.5 animate-in fade-in">Settings Panels</p>
            <div className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1.5 pb-2 lg:pb-0 scrollbar-none">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-shrink-0 flex items-center space-x-2.5 lg:space-x-3 px-3 py-2 lg:py-2.5 rounded-xl text-left transition duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-500/10 to-indigo-500/5 text-brand-600 dark:text-brand-400 border-b-2 lg:border-b-0 lg:border-l-3 border-brand-500 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <Icon size={15} className={isActive ? 'text-brand-500' : 'text-slate-400'} />
                    <div>
                      <span className="text-xs font-bold block whitespace-nowrap">{tab.label}</span>
                      <span className="hidden lg:block text-[9px] text-slate-400 block -mt-0.5">{tab.desc}</span>
                    </div>
                    {isActive && <ChevronRight size={12} className="hidden lg:block ml-auto text-brand-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connected User Profile Card (Hidden on Mobile) */}
          <div className="hidden lg:block bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-3 shadow-premium dark:shadow-premium-dark space-y-2.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-xs uppercase shadow-inner">
                {user?.name?.slice(0, 2) || 'UR'}
              </div>
              <div>
                <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">Logged In As</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block -mt-0.5">{user?.name}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-200/30 dark:border-darkBorder/20">
              <span className="text-slate-500 font-medium">Security Access Role:</span>
              <span className="font-extrabold text-brand-600 dark:text-brand-400 uppercase tracking-wider">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Right Side Settings Panel Area */}
        <div className="lg:col-span-3 space-y-3">

          {/* TAB 1: COMPANY METADATA PANEL */}
          {activeTab === 'metadata' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* Departments Panel */}
              <div className="p-4 bg-white/80 dark:bg-darkCard backdrop-blur-md border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark flex flex-col justify-between min-h-[300px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkBorder/40 pb-2">
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center">
                        <Building size={14} className="mr-2 text-brand-500" /> Corporate Departments
                      </h3>
                      <p className="text-[9.5px] text-slate-400">Add or remove departments for job tagging.</p>
                    </div>
                    <span className="text-[9.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-200/20">
                      {departments.length}
                    </span>
                  </div>

                  {/* Departments tag list */}
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {departments.map((dept, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-brand-500/5 to-indigo-500/5 dark:from-brand-500/10 dark:to-indigo-500/10 border border-brand-500/15 dark:border-brand-500/20 text-slate-600 dark:text-slate-300 rounded-lg text-xs"
                      >
                        <span className="font-medium">{dept}</span>
                        {isHR && (
                          <button
                            onClick={() => handleRemoveDept(idx)}
                            className="text-slate-400 hover:text-rose-500 font-bold ml-1.5 focus:outline-none"
                            title="Remove Department"
                          >
                            &times;
                          </button>
                        )}
                      </span>
                    ))}
                    {departments.length === 0 && (
                      <span className="text-xs text-slate-400 italic">No departments configured.</span>
                    )}
                  </div>
                </div>

                {/* Add department input */}
                {isHR && (
                  <form onSubmit={handleAddDept} className="flex items-center space-x-2 mt-4 pt-3 border-t border-slate-100 dark:border-darkBorder/40">
                    <input
                      type="text"
                      disabled={saving}
                      value={newDept}
                      onChange={(e) => setNewDept(e.target.value)}
                      placeholder="Add Department (e.g. AI Dev)"
                      className="flex-grow h-9 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center justify-center w-9 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-all transform hover:scale-[1.03]"
                    >
                      <Plus size={16} />
                    </button>
                  </form>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: AI ALGORITHMS & THRESHOLDS */}
          {activeTab === 'ai' && (
            <div className="bg-white/80 dark:bg-darkCard backdrop-blur-md border border-slate-200/60 dark:border-darkBorder rounded-2xl p-4 shadow-premium dark:shadow-premium-dark space-y-5">
              <div className="border-b border-slate-100 dark:border-darkBorder/40 pb-2">
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center">
                  <Cpu size={14} className="mr-2 text-brand-500" /> AI Parsing Core Configurations
                </h3>
                <p className="text-[9.5px] text-slate-400">Configure parsing rules, score matching logic, and evaluation metrics.</p>
              </div>

              {/* AI Provider API Key — Admin only */}
              {isAdmin ? (
              <div className="space-y-3 bg-slate-50/40 dark:bg-slate-900/10 p-3 rounded-xl border border-slate-200/30 dark:border-darkBorder/10">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center">
                      <Key size={13} className="text-brand-500 mr-1.5" /> LLM Provider API Key
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Paste any OpenAI, Anthropic Claude, NVIDIA NIM, or Google Gemini key — the provider is detected automatically.
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                    aiKeyConfigured
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200/40 text-slate-500'
                  }`}>
                    {aiKeyConfigured ? `Active: ${PROVIDER_LABELS[aiProvider] || aiProvider}` : 'Mock Engine (no key)'}
                  </span>
                </div>

                {/* Current key status */}
                {aiKeyConfigured && (
                  <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900/40 border border-slate-200/50 dark:border-darkBorder/30 rounded-lg">
                    <div className="flex items-center space-x-2 min-w-0">
                      <ShieldCheck size={14} className="text-emerald-500 flex-shrink-0" />
                      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">{aiKeyMasked}</span>
                    </div>
                    {isHR && (
                      <button
                        onClick={handleRemoveApiKey}
                        disabled={savingKey}
                        className="text-[10px] font-semibold text-rose-500 hover:text-rose-600 hover:underline flex-shrink-0 ml-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}

                {/* Add / replace key */}
                {isHR && (
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        autoComplete="off"
                        disabled={savingKey}
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        placeholder={aiKeyConfigured ? 'Paste a new key to replace…' : 'sk-... / sk-ant-... / nvapi-... / AIza... / AQ...'}
                        className="flex-grow h-9 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                      {newApiKey.trim() && detectedProvider !== 'unknown' && (
                        <button
                          onClick={handleSaveApiKey}
                          disabled={savingKey}
                          className="flex items-center justify-center space-x-1.5 px-3.5 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition w-full sm:w-auto animate-in fade-in duration-200"
                        >
                          {savingKey ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          <span>Save Key</span>
                        </button>
                      )}
                    </div>
                    {newApiKey.trim() && (
                      <p className={`text-[10px] font-medium ${detectedProvider === 'unknown' ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {detectedProvider === 'unknown'
                          ? 'Unrecognized key format — expected sk-... , sk-ant-... , nvapi-... , or AIza...'
                          : `Detected provider: ${PROVIDER_LABELS[detectedProvider]}`}
                      </p>
                    )}
                    <p className="text-[9.5px] text-slate-400">
                      The key is stored server-side and never shown again — only a masked hint is displayed.
                    </p>
                  </div>
                )}

                {/* AI model picker — shows the models the current/entered key supports */}
                {showModelPicker && (
                  <div className="pt-3 mt-1 border-t border-slate-200/50 dark:border-darkBorder/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center">
                          <Cpu size={13} className="text-brand-500 mr-1.5" /> AI Model
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {enteringValidKey && !aiKeyConfigured
                            ? `Models available for the entered ${PROVIDER_LABELS[pickerProvider] || pickerProvider} key — pick one, then Save Key.`
                            : `Models available for your ${PROVIDER_LABELS[pickerProvider] || pickerProvider} key.`}
                        </p>
                      </div>
                      <button
                        onClick={fetchModels}
                        disabled={loadingModels}
                        className="flex items-center gap-1 text-[10px] font-semibold text-brand-500 hover:text-brand-600 transition disabled:opacity-50"
                      >
                        {loadingModels ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                        <span>Refresh</span>
                      </button>
                    </div>

                    {loadingModels ? (
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 py-1">
                        <Loader2 size={13} className="animate-spin" /> Loading available models…
                      </div>
                    ) : availableModels.length > 0 ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="flex-grow h-9 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        >
                          <option value="">Provider default</option>
                          {availableModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        {/* Persisting alone only makes sense once the key is saved;
                            for a newly-entered key, "Save Key" stores key + model. */}
                        {aiKeyConfigured && originalConfig && selectedModel !== originalConfig.aiModel && (
                          <button
                            onClick={handleSaveModel}
                            disabled={savingModel}
                            className="flex items-center justify-center space-x-1.5 px-3.5 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition w-full sm:w-auto animate-in fade-in duration-200"
                          >
                            {savingModel ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            <span>Set Model</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">
                        No models listed for this key. The provider default will be used.
                      </p>
                    )}
                  </div>
                )}
              </div>
              ) : (
                <div className="p-3 bg-slate-50/40 dark:bg-slate-900/10 rounded-xl border border-slate-200/30 dark:border-darkBorder/10 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-brand-500 flex-shrink-0" />
                  The AI provider key is managed by an administrator. Résumé analysis uses the configured key automatically — nothing to set here.
                </div>
              )}

              {/* Threshold matching slider */}
              <div className="space-y-3 bg-slate-50/40 dark:bg-slate-900/10 p-3 rounded-xl border border-slate-200/30 dark:border-darkBorder/10">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Min AI Match Score Threshold</span>
                    <p className="text-[10px] text-slate-400">Filters high-relevance matches for resume tagging.</p>
                  </div>
                  <span className="text-sm font-extrabold text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/10 px-3 py-1 rounded-lg">
                    {minAiScore}%
                  </span>
                </div>

                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  disabled={!isHR || saving}
                  value={minAiScore}
                  onChange={(e) => setMinAiScore(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-600"
                />

                <div className="flex justify-between text-[9px] text-slate-400 font-semibold px-0.5">
                  <span>40% (Permissive)</span>
                  <span>65% (Balanced)</span>
                  <span>100% (Strict Filter)</span>
                </div>
              </div>

              {/* Status details of AI parsers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-darkBorder/20 rounded-xl space-y-1.5">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                    <ShieldCheck size={13} className="text-brand-500 mr-1.5" /> Text Parsing Engine
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                    Supported formats: **PDF** (via PDF-Parse) and **DOCX** (via Mammoth). Maximum file capacity threshold: **10MB** per resume payload.
                  </p>
                </div>

                <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-darkBorder/20 rounded-xl space-y-1.5">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                    <Sliders size={13} className="text-brand-500 mr-1.5" /> AI Model Integrations
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                    Abstracted core supports **OpenAI GPT-4o-mini**, **Anthropic Claude**, **NVIDIA NIM**, and **Google Gemini 1.5**. Falling back automatically to **Mock Parser Heuristics** when offline.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM DIAGNOSTICS & CREDENTIALS */}
          {activeTab === 'system' && (
            <div className="bg-white/80 dark:bg-darkCard backdrop-blur-md border border-slate-200/60 dark:border-darkBorder rounded-2xl p-4 shadow-premium dark:shadow-premium-dark space-y-5">
              <div className="border-b border-slate-100 dark:border-darkBorder/40 pb-2">
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center">
                  <Database size={14} className="mr-2 text-brand-500" /> Database & Server Diagnostics
                </h3>
                <p className="text-[9.5px] text-slate-400">Verifying live server health and database status indicators.</p>
              </div>

              {/* Data & Privacy (GDPR) — Admin only */}
              {isAdmin && (
                <div className="space-y-3 bg-slate-50/40 dark:bg-slate-900/10 p-3 rounded-xl border border-slate-200/30 dark:border-darkBorder/10">
                  <div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center">
                      <ShieldCheck size={13} className="text-brand-500 mr-1.5" /> Data Retention (GDPR)
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Automatically delete candidate records + résumé files older than this many days. Hired candidates are always kept. Set 0 to keep everything.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(e.target.value)}
                      className="h-9 w-28 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                    <span className="text-[11px] text-slate-500">
                      {Number(retentionDays) > 0
                        ? `days — candidates older than ${retentionDays} days are auto-purged`
                        : 'days — retention OFF (nothing auto-deleted)'}
                    </span>
                  </div>
                  <p className="text-[9.5px] text-slate-400">Saved with “Save Settings”. Purge runs periodically in the background.</p>
                </div>
              )}

              {/* Change your password — available to every signed-in user */}
              <div className="space-y-3 bg-slate-50/40 dark:bg-slate-900/10 p-3 rounded-xl border border-slate-200/30 dark:border-darkBorder/10">
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center">
                    <Key size={13} className="text-brand-500 mr-1.5" /> Change Your Password
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Update the password for your own account ({user?.email}).</p>
                </div>
                <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="password" autoComplete="current-password" required placeholder="Current password"
                    value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                    className="h-9 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <input
                    type="password" autoComplete="new-password" required placeholder="New password (min 6)"
                    value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                    className="h-9 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <input
                    type="password" autoComplete="new-password" required placeholder="Confirm new password"
                    value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                    className="h-9 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  {(pwForm.current || pwForm.next || pwForm.confirm) && (
                    <button
                      type="submit" disabled={changingPw}
                      className="sm:col-span-3 flex items-center justify-center gap-1.5 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition animate-in fade-in duration-200"
                    >
                      {changingPw ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                      <span>Update Password</span>
                    </button>
                  )}
                </form>
              </div>

              {/* Live Server connectivity card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-xl flex items-center space-x-3">
                  <div className="w-8 h-8 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg flex items-center justify-center">
                    <Server size={16} />
                  </div>
                  <div>
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase block">API Server Status</span>
                    <span className="text-xs font-bold text-emerald-500 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" /> Active
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-xl flex items-center space-x-3">
                  <div className="w-8 h-8 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg flex items-center justify-center">
                    <Database size={16} />
                  </div>
                  <div>
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase block">Active Database</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      In-Memory Store
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/20 rounded-xl flex items-center space-x-3">
                  <div className="w-8 h-8 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg flex items-center justify-center">
                    <Key size={16} />
                  </div>
                  <div>
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase block">Security Keys</span>
                    <span className="text-xs font-bold text-amber-500">
                      JWT (30d)
                    </span>
                  </div>
                </div>

              </div>

              {/* Account note (demo/seed data removed) */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center">
                  <Key size={13} className="text-brand-500 mr-2" /> Accounts
                </span>
                <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  No demo accounts are pre-seeded. New accounts are created by an Admin in <strong className="text-slate-700 dark:text-slate-300">User Management</strong>; public sign-up is disabled.
                  In the in-memory store, accounts and records persist until the server restarts.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'accounts' && isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start animate-in fade-in duration-200">
              {/* Create user */}
              <div className="lg:col-span-1 p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center mb-3">
                  <UserPlus size={14} className="mr-2 text-brand-500" /> Create Account
                </h3>
                <form onSubmit={handleCreateUser} className="space-y-2.5">
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      name="name"
                      value={createForm.name}
                      onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      className="w-full h-10 pl-9 pr-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      name="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="email@company.com"
                      className="w-full h-10 pl-9 pr-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      name="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Temp password (min 6 chars)"
                      className="w-full h-10 pl-9 pr-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      required
                    />
                  </div>
                  <select
                    name="role"
                    value={createForm.role}
                    onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
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
                {usersLoading ? (
                  <div className="p-10 flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-brand-500" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-400 flex flex-col items-center">
                    <UsersIcon size={32} className="text-slate-300 dark:text-slate-700 mb-2" />
                    No users found.
                  </div>
                ) : (
                  <>
                    {/* Desktop View (Hidden on Mobile) */}
                    <div className="hidden md:block overflow-x-auto">
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
                                      onClick={() => handleDeleteUser(u)}
                                      disabled={busyId === u._id}
                                      className="p-1 text-slate-400 hover:text-rose-500 rounded transition disabled:opacity-40"
                                      title="Delete staff account"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card List View (Hidden on Desktop) */}
                    <div className="block md:hidden divide-y divide-slate-100 dark:divide-darkBorder/60">
                      {users.map((u) => {
                        const isSelf = u._id === user?._id;
                        return (
                          <div key={u._id} className="p-4 space-y-3 hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400 uppercase flex-shrink-0">
                                {u.name?.slice(0, 2) || 'U'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block truncate text-xs">
                                  {u.name}{isSelf && <span className="text-[9px] font-semibold text-brand-500 ml-1.5">(you)</span>}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate block text-[10.5px]">{u.email}</span>
                              </div>
                              {!isSelf && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={busyId === u._id}
                                  className="p-1 text-slate-400 hover:text-rose-500 rounded transition disabled:opacity-40 flex-shrink-0"
                                  title="Delete staff account"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-darkBorder/20 text-xs">
                              <span className="text-slate-400 text-[10px] font-medium">Access Role:</span>
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
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Bottom snackbar / toast for save & action feedback */}
      {status.message && (
<div className="fixed bottom-6 right-6 z-50 w-full max-w-md px-3 animate-in fade-in slide-in-from-bottom-4 duration-200">          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs shadow-xl border bg-white dark:bg-slate-900 ${
            status.type === 'success'
              ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}>
            {status.type === 'success'
              ? <CheckCircle size={15} className="text-emerald-500 flex-shrink-0" />
              : <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />}
            <span className="font-medium flex-1">{status.message}</span>
            <button
              onClick={() => setStatus({ type: '', message: '' })}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition flex-shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Settings;
