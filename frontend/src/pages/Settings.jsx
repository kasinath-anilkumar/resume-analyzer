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
  X
} from 'lucide-react';

const Settings = () => {
  const { user } = useAuth();

  // Tab control state
  const [activeTab, setActiveTab] = useState('metadata'); // 'metadata' | 'ai' | 'system'

  // Settings States
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [minAiScore, setMinAiScore] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

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

  // Form input states
  const [newDept, setNewDept] = useState('');
  const [newLoc, setNewLoc] = useState('');

  // Server state metadata
  const [dbState, setDbState] = useState({ connected: false, type: 'In-Memory Fallback' });

  const isHR = user && ['Admin', 'Recruiter'].includes(user.role);
  // Only Admins may view or manage the AI provider key / model.
  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/settings');
        if (res.data.success) {
          const { departments, locations, minAiScore, aiProvider, aiKeyConfigured, aiKeyMasked, aiModel } = res.data.data;
          setDepartments(departments || []);
          setLocations(locations || []);
          setMinAiScore(minAiScore || 60);
          setAiProvider(aiProvider || 'mock');
          setAiKeyConfigured(!!aiKeyConfigured);
          setAiKeyMasked(aiKeyMasked || '');
          setSelectedModel(aiModel || '');
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

  const handleAddLoc = (e) => {
    e.preventDefault();
    if (!isHR) return;
    const trimmed = newLoc.trim();
    if (!trimmed) return;
    if (locations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      showStatus('error', `Location "${trimmed}" already exists.`);
      return;
    }
    setLocations([...locations, trimmed]);
    setNewLoc('');
    showStatus('success', `Added "${trimmed}" to office locations.`);
  };

  const handleRemoveLoc = (index) => {
    if (!isHR) return;
    const removed = locations[index];
    setLocations(locations.filter((_, i) => i !== index));
    showStatus('success', `Removed "${removed}" location.`);
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

  const handleSaveModel = async () => {
    if (!isHR) return;
    setSavingModel(true);
    try {
      const res = await api.put('/settings', { aiModel: selectedModel });
      if (res.data.success) {
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-[calc(100vh-140px)]">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  const tabs = [
    { id: 'metadata', label: 'Company Metadata', icon: Building, desc: 'Departments and office locations' },
    { id: 'ai', label: 'AI Algorithms', icon: Cpu, desc: 'Score thresholds and parsing filters' },
    { id: 'system', label: 'System Diagnostics', icon: Server, desc: 'Database connections and credentials' }
  ];

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

        {isHR && (
          <div className="flex items-center space-x-2 relative z-10">
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
          <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-2 shadow-premium dark:shadow-premium-dark space-y-1">
            <p className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2.5 py-1.5">Settings Panels</p>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition duration-200 ${isActive
                    ? 'bg-gradient-to-r from-brand-500/10 to-indigo-500/5 text-brand-600 dark:text-brand-400 border-l-3 border-brand-500 pl-2.5'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                >
                  <Icon size={16} className={isActive ? 'text-brand-500' : 'text-slate-400'} />
                  <div>
                    <span className="text-xs font-bold block">{tab.label}</span>
                    <span className="text-[9px] text-slate-400 block -mt-0.5">{tab.desc}</span>
                  </div>
                  {isActive && <ChevronRight size={12} className="ml-auto text-brand-500" />}
                </button>
              );
            })}
          </div>

          {/* Connected User Profile Card */}
          <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-3 shadow-premium dark:shadow-premium-dark space-y-2.5">
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

              {/* Office Locations Panel */}
              <div className="p-4 bg-white/80 dark:bg-darkCard backdrop-blur-md border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark flex flex-col justify-between min-h-[300px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkBorder/40 pb-2">
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center">
                        <MapPin size={14} className="mr-2 text-brand-500" /> Hiring Locations
                      </h3>
                      <p className="text-[9.5px] text-slate-400">Custom office structures and remote options.</p>
                    </div>
                    <span className="text-[9.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-200/20">
                      {locations.length}
                    </span>
                  </div>

                  {/* Locations tag list */}
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {locations.map((loc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-brand-500/5 to-indigo-500/5 dark:from-brand-500/10 dark:to-indigo-500/10 border border-brand-500/15 dark:border-brand-500/20 text-slate-600 dark:text-slate-300 rounded-lg text-xs"
                      >
                        <span className="font-medium">{loc}</span>
                        {isHR && (
                          <button
                            onClick={() => handleRemoveLoc(idx)}
                            className="text-slate-400 hover:text-rose-500 font-bold ml-1.5 focus:outline-none"
                            title="Remove Location"
                          >
                            &times;
                          </button>
                        )}
                      </span>
                    ))}
                    {locations.length === 0 && (
                      <span className="text-xs text-slate-400 italic">No locations configured.</span>
                    )}
                  </div>
                </div>

                {/* Add location input */}
                {isHR && (
                  <form onSubmit={handleAddLoc} className="flex items-center space-x-2 mt-4 pt-3 border-t border-slate-100 dark:border-darkBorder/40">
                    <input
                      type="text"
                      disabled={saving}
                      value={newLoc}
                      onChange={(e) => setNewLoc(e.target.value)}
                      placeholder="Add Location (e.g. Tokyo, JP)"
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
                    <div className="flex items-center space-x-2">
                      <input
                        type="password"
                        autoComplete="off"
                        disabled={savingKey}
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        placeholder={aiKeyConfigured ? 'Paste a new key to replace…' : 'sk-... / sk-ant-... / nvapi-... / AIza... / AQ...'}
                        className="flex-grow h-9 px-3 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                      <button
                        onClick={handleSaveApiKey}
                        disabled={savingKey || !newApiKey.trim() || detectedProvider === 'unknown'}
                        className="flex items-center space-x-1.5 px-3.5 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition"
                      >
                        {savingKey ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        <span>Save Key</span>
                      </button>
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
                      <div className="flex items-center gap-2">
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
                        {aiKeyConfigured && (
                          <button
                            onClick={handleSaveModel}
                            disabled={savingModel}
                            className="flex items-center space-x-1.5 px-3.5 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
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
