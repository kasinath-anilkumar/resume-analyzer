import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import api from '../services/api';

// Shared upload constraints — exported so the Upload page can render limits.
export const ACCEPT_EXT = [
  'pdf', 'doc', 'docx', 'txt', 'rtf',
  'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'gif',
];
export const ACCEPT_ATTR = ACCEPT_EXT.map((e) => `.${e}`).join(',') + ',image/*';
export const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_SIZE = 1024 * 1024 * 1024; // 1 GB total per batch
export const MAX_FILES = 1000; // max files per batch
export const fmtMB = (bytes) => (bytes / 1024 / 1024).toFixed(1);

const UploadContext = createContext(null);

// The analysis runs in a server-side worker (candidates carry their own
// analysis_status in the DB), so a page refresh never actually stops analysis —
// but the in-memory progress widget used to reset. We persist a lightweight
// snapshot (item metadata + per-item status, NOT the File objects, which the
// browser can't serialize) so the widget survives a refresh and RESUMES polling
// any already-uploaded candidates to completion.
const STORAGE_KEY = 'rae_upload_batch_v1';

const loadSnapshot = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || !Array.isArray(snap.meta)) return null;
    const states = Object.values(snap.status || {});
    // Only restore a batch that was still IN-FLIGHT (something uploading/analyzing)
    // — a finished batch shouldn't reappear on every future page load. (Pure — the
    // stale entry is cleared by the persist effect, never as a render side-effect.)
    const active = states.some((s) => ['uploading', 'analyzing'].includes(s?.state));
    if (!active) return null;
    // Drop 'idle' items — they were never uploaded, and the File is gone.
    const meta = snap.meta.filter((m) => snap.status?.[m.key] && snap.status[m.key].state !== 'idle');
    const status = {};
    meta.forEach((m) => { status[m.key] = snap.status[m.key]; });
    return { meta, status, jobLabel: snap.jobLabel || '' };
  } catch {
    return null;
  }
};

export const useUpload = () => {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used within an UploadProvider');
  return ctx;
};

// Holds the resume upload queue + the sequential analysis loop at the app root
// so uploads keep processing even when the user navigates away from /upload.
export const UploadProvider = ({ children }) => {
  const snap = loadSnapshot();
  // Restored items have no File (file:null) — they're already uploaded/analyzing
  // and only need their status tracked, not re-uploading.
  const [items, setItems] = useState(() => (snap ? snap.meta.map((m) => ({ ...m, file: null })) : []));
  const [status, setStatus] = useState(() => (snap ? snap.status || {} : {}));
  const [uploading, setUploading] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [batchSkipped, setBatchSkipped] = useState(0);
  const [jobLabel, setJobLabel] = useState(() => (snap ? snap.jobLabel || '' : ''));

  // Keep live refs so async loops always see the latest queue/status.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const statusRef = useRef(status);
  statusRef.current = status;
  const uploadingRef = useRef(uploading);
  uploadingRef.current = uploading;

  const makeKey = (file) =>
    `${file.webkitRelativePath || file.name}::${file.size}::${Math.random().toString(36).slice(2, 7)}`;

  // --- Persistence: mirror a serializable snapshot to localStorage -----------
  useEffect(() => {
    try {
      if (items.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        const meta = items.map((i) => ({ key: i.key, name: i.name, size: i.size, relPath: i.relPath }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ meta, status, jobLabel }));
      }
    } catch { /* storage full / disabled — non-fatal */ }
  }, [items, status, jobLabel]);

  const setItemStatus = (key, patch) =>
    setStatus((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));

  // Poll a candidate until the background worker finishes its analysis.
  const pollAnalysis = async (candidateId, { intervalMs = 2500, maxAttempts = 120 } = {}) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await api.get(`/candidates/${candidateId}`);
        const c = res.data?.data;
        if (['completed', 'failed', 'rejected'].includes(c?.analysisStatus)) return c;
      } catch (_) { /* transient — keep polling */ }
    }
    return null;
  };

  const finalizeFromCandidate = (key, finalC, candidateId) => {
    if (finalC?.analysisStatus === 'completed') {
      const ai = finalC.aiAnalysis || {};
      setItemStatus(key, {
        progress: 100, state: 'success', message: 'Analysis complete', candidateId,
        result: {
          score: Number.isFinite(ai.overallScore) ? ai.overallScore : 0,
          matchPercentage: Number.isFinite(ai.matchPercentage) ? ai.matchPercentage : null,
          recommendation: ai.recommendation || '',
          candidateId,
        },
      });
    } else if (finalC?.analysisStatus === 'failed') {
      setItemStatus(key, { progress: 100, state: 'error', message: finalC.analysisError || 'AI analysis failed.', candidateId });
    } else if (finalC?.analysisStatus === 'rejected') {
      setItemStatus(key, { progress: 100, state: 'error', message: finalC.analysisError || 'Rejected — not a valid résumé.', candidateId });
    } else {
      // Timed out locally — it will still finish server-side and show in Candidates.
      setItemStatus(key, {
        progress: 100, state: 'success', message: 'Uploaded — still analyzing (will appear in Candidates)', candidateId,
        result: { score: null, matchPercentage: null, recommendation: '', candidateId },
      });
    }
  };

  // --- Resume after a refresh (runs once) ------------------------------------
  useEffect(() => {
    const entries = Object.entries(statusRef.current || {});
    const resumable = entries.filter(([, st]) => ['uploading', 'analyzing'].includes(st?.state));
    if (!resumable.length) return;

    let active = 0;
    resumable.forEach(([key, st]) => {
      const cid = st?.candidateId || st?.result?.candidateId;
      if (cid) {
        // Already uploaded — resume polling to completion.
        active += 1;
        setItemStatus(key, { state: 'analyzing', message: 'Resuming analysis…', candidateId: cid });
        pollAnalysis(cid).then((finalC) => {
          finalizeFromCandidate(key, finalC, cid);
        }).finally(() => {
          active -= 1;
          if (active <= 0) setUploading(false);
        });
      } else {
        // Never finished uploading before the refresh — the File is gone.
        setItemStatus(key, { progress: 100, state: 'error', message: 'Upload was interrupted — please re-add this file.' });
      }
    });
    if (active > 0) setUploading(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Warn before leaving while files are still being SENT ------------------
  // (Analysis itself is safe server-side; unsent files can't be recovered.)
  useEffect(() => {
    const handler = (e) => {
      if (uploadingRef.current) { e.preventDefault(); e.returnValue = ''; return ''; }
      return undefined;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    const current = itemsRef.current;
    let total = current.reduce((s, it) => s + it.size, 0);
    let count = current.length;
    let skippedCount = 0;
    let batchCount = 0;
    const valid = [];
    for (const file of incoming) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPT_EXT.includes(ext) || file.size > MAX_SIZE || file.size === 0) { skippedCount++; continue; }
      if (count >= MAX_FILES || total + file.size > MAX_TOTAL_SIZE) { batchCount++; continue; }
      valid.push({ key: makeKey(file), file, name: file.name, size: file.size, relPath: file.webkitRelativePath || '' });
      total += file.size;
      count += 1;
    }
    if (valid.length) {
      setItems((prev) => [...prev, ...valid]);
      setStatus((prev) => {
        const next = { ...prev };
        valid.forEach((v) => { next[v.key] = { progress: 0, state: 'idle', message: '' }; });
        return next;
      });
    }
    if (skippedCount) setSkipped((s) => s + skippedCount);
    if (batchCount) setBatchSkipped((s) => s + batchCount);
  };

  const removeItem = (key) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
    setStatus((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const resetAll = () => {
    setItems([]);
    setStatus({});
    setSkipped(0);
    setBatchSkipped(0);
    setJobLabel('');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  // Sequentially upload + analyze the queue. Uploads return immediately (analysis
  // runs in the server-side worker); we poll each candidate to completion.
  const startUpload = async (jobId, label = '') => {
    const queue = itemsRef.current;
    if (queue.length === 0 || !jobId || uploading) return;
    setUploading(true);
    setJobLabel(label);

    for (const it of queue) {
      // Skip restored items (no File) and already-finished ones.
      if (!it.file) continue;
      if (['success', 'error'].includes(status[it.key]?.state)) continue;

      setItemStatus(it.key, { progress: 5, state: 'uploading', message: 'Uploading resume...' });

      const formData = new FormData();
      formData.append('resume', it.file);
      formData.append('jobId', jobId);

      let analyzeTimer = null;
      let candidateId = null;
      const startAnalyzing = () => {
        if (analyzeTimer) return;
        setItemStatus(it.key, { progress: 90, state: 'analyzing', message: 'Matching in Progress...', candidateId });
        analyzeTimer = setInterval(() => {
          setStatus((prev) => {
            const cur = prev[it.key];
            if (!cur || cur.state !== 'analyzing') return prev;
            const next = Math.min(97, cur.progress + Math.max(0.5, (97 - cur.progress) * 0.06));
            return { ...prev, [it.key]: { ...cur, progress: next } };
          });
        }, 350);
      };

      try {
        const res = await api.post('/candidates', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (pe) => {
            const percent = pe.total ? Math.round((pe.loaded * 100) / pe.total) : 0;
            if (percent < 100) {
              setItemStatus(it.key, { progress: Math.min(percent, 90), state: 'uploading', message: 'Uploading resume...' });
            }
          },
        });

        candidateId = res.data?.data?._id;
        if (!res.data.success || !candidateId) throw new Error(res.data?.message || 'Upload failed');

        // Persist the candidateId immediately (so a refresh can resume tracking),
        // then poll the background worker to completion.
        startAnalyzing();
        const finalC = await pollAnalysis(candidateId);
        if (analyzeTimer) { clearInterval(analyzeTimer); analyzeTimer = null; }
        finalizeFromCandidate(it.key, finalC, candidateId);
      } catch (err) {
        console.error(err);
        if (analyzeTimer) { clearInterval(analyzeTimer); analyzeTimer = null; }
        setItemStatus(it.key, { progress: 0, state: 'error', message: err.response?.data?.message || err.message || 'Processing failed.' });
      }
    }

    setUploading(false);
  };

  const value = {
    items, status, uploading, skipped, batchSkipped, jobLabel,
    addFiles, removeItem, resetAll, startUpload,
  };

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
};

export default UploadContext;
