import React, { createContext, useContext, useState, useRef } from 'react';
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

export const useUpload = () => {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used within an UploadProvider');
  return ctx;
};

// Holds the resume upload queue + the sequential analysis loop at the app root
// so uploads keep processing even when the user navigates away from /upload.
export const UploadProvider = ({ children }) => {
  const [items, setItems] = useState([]); // { key, file, name, size, relPath }
  const [status, setStatus] = useState({}); // key -> { progress, state, message, result? }
  const [uploading, setUploading] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [batchSkipped, setBatchSkipped] = useState(0);
  const [jobLabel, setJobLabel] = useState(''); // job title used for the active run (for the widget)

  // Keep a live ref to items so the async loop always iterates the latest queue.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const makeKey = (file) =>
    `${file.webkitRelativePath || file.name}::${file.size}::${Math.random().toString(36).slice(2, 7)}`;

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    const current = itemsRef.current;
    let total = current.reduce((s, it) => s + it.size, 0);
    let count = current.length;
    let skippedCount = 0; // unsupported type / oversize / empty
    let batchCount = 0; // rejected because the batch caps were reached
    const valid = [];
    for (const file of incoming) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPT_EXT.includes(ext) || file.size > MAX_SIZE || file.size === 0) {
        skippedCount++;
        continue;
      }
      if (count >= MAX_FILES || total + file.size > MAX_TOTAL_SIZE) {
        batchCount++;
        continue;
      }
      valid.push({
        key: makeKey(file),
        file,
        name: file.name,
        size: file.size,
        relPath: file.webkitRelativePath || '',
      });
      total += file.size;
      count += 1;
    }
    if (valid.length) {
      setItems((prev) => [...prev, ...valid]);
      setStatus((prev) => {
        const next = { ...prev };
        valid.forEach((v) => {
          next[v.key] = { progress: 0, state: 'idle', message: '' };
        });
        return next;
      });
    }
    if (skippedCount) setSkipped((s) => s + skippedCount);
    if (batchCount) setBatchSkipped((s) => s + batchCount);
  };

  const removeItem = (key) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
    setStatus((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  const resetAll = () => {
    setItems([]);
    setStatus({});
    setSkipped(0);
    setBatchSkipped(0);
    setJobLabel('');
  };

  // Poll a candidate until the background worker finishes its analysis.
  // Returns the final candidate (completed/failed) or null on timeout.
  const pollAnalysis = async (candidateId, { intervalMs = 2500, maxAttempts = 72 } = {}) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await api.get(`/candidates/${candidateId}`);
        const c = res.data?.data;
        if (c?.analysisStatus === 'completed' || c?.analysisStatus === 'failed') return c;
      } catch (_) { /* transient — keep polling */ }
    }
    return null;
  };

  // Sequentially upload + analyze the queue. Uploads now return immediately
  // (analysis runs in the server-side worker); we poll each candidate to
  // completion. Lives in the provider so it keeps running across route changes.
  const startUpload = async (jobId, label = '') => {
    const queue = itemsRef.current;
    if (queue.length === 0 || !jobId || uploading) return;
    setUploading(true);
    setJobLabel(label);

    for (const it of queue) {
      if (status[it.key]?.state === 'success') continue;

      setStatus((prev) => ({
        ...prev,
        [it.key]: { progress: 5, state: 'uploading', message: 'Uploading resume...' },
      }));

      const formData = new FormData();
      formData.append('resume', it.file);
      formData.append('jobId', jobId);

      let analyzeTimer = null;
      const startAnalyzing = () => {
        if (analyzeTimer) return;
        setStatus((prev) => ({
          ...prev,
          [it.key]: { progress: 90, state: 'analyzing', message: 'Matching in Progress...' },
        }));
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
        // 1) Upload the file — returns immediately with a queued candidate.
        const res = await api.post('/candidates', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (pe) => {
            const percent = pe.total ? Math.round((pe.loaded * 100) / pe.total) : 0;
            if (percent >= 100) {
              startAnalyzing();
            } else {
              setStatus((prev) => ({
                ...prev,
                [it.key]: { progress: Math.min(percent, 90), state: 'uploading', message: 'Uploading resume...' },
              }));
            }
          },
        });

        const candidateId = res.data?.data?._id;
        if (!res.data.success || !candidateId) throw new Error(res.data?.message || 'Upload failed');

        // 2) Poll the background worker until analysis finishes.
        startAnalyzing();
        const finalC = await pollAnalysis(candidateId);
        if (analyzeTimer) { clearInterval(analyzeTimer); analyzeTimer = null; }

        if (finalC?.analysisStatus === 'completed') {
          const ai = finalC.aiAnalysis || {};
          setStatus((prev) => ({
            ...prev,
            [it.key]: {
              progress: 100,
              state: 'success',
              message: 'Analysis complete',
              result: {
                score: Number.isFinite(ai.overallScore) ? ai.overallScore : 0,
                matchPercentage: Number.isFinite(ai.matchPercentage) ? ai.matchPercentage : null,
                recommendation: ai.recommendation || '',
                candidateId,
              },
            },
          }));
        } else if (finalC?.analysisStatus === 'failed') {
          setStatus((prev) => ({
            ...prev,
            [it.key]: { progress: 100, state: 'error', message: finalC.analysisError || 'AI analysis failed.' },
          }));
        } else {
          // Still queued after the poll window — it will finish server-side.
          setStatus((prev) => ({
            ...prev,
            [it.key]: {
              progress: 100,
              state: 'success',
              message: 'Uploaded — still analyzing (will appear in Candidates)',
              result: { score: null, matchPercentage: null, recommendation: '', candidateId },
            },
          }));
        }
      } catch (err) {
        console.error(err);
        if (analyzeTimer) { clearInterval(analyzeTimer); analyzeTimer = null; }
        setStatus((prev) => ({
          ...prev,
          [it.key]: { progress: 0, state: 'error', message: err.response?.data?.message || err.message || 'Processing failed.' },
        }));
      }
    }

    setUploading(false);
  };

  const value = {
    items,
    status,
    uploading,
    skipped,
    batchSkipped,
    jobLabel,
    addFiles,
    removeItem,
    resetAll,
    startUpload,
  };

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
};

export default UploadContext;
