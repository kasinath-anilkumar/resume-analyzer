import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  useUpload,
  ACCEPT_ATTR,
  MAX_TOTAL_SIZE,
  MAX_FILES,
  fmtMB,
} from '../context/UploadContext';
import {
  Upload as UploadIcon,
  FolderUp,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Users,
  ArrowRight,
  FileSpreadsheet,
} from 'lucide-react';

const scoreBadgeClass = (score) => {
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
  if (score >= 60) return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
  return 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
};

const recBadgeClass = (rec = '') => {
  const r = rec.toLowerCase();
  if (r.includes('hire')) return 'bg-emerald-500/10 text-emerald-600';
  if (r.includes('interview') || r.includes('proceed') || r.includes('screen')) return 'bg-amber-500/10 text-amber-600';
  if (r.includes('reject') || r.includes('no')) return 'bg-rose-500/10 text-rose-600';
  return 'bg-slate-200 dark:bg-slate-800 text-slate-500';
};

// Recursively collect File objects from a dropped directory entry.
async function collectFilesFromEntry(entry) {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve) => entry.file((f) => resolve([f]), () => resolve([])));
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = [];
    await new Promise((resolve) => {
      const readBatch = () =>
        reader.readEntries((batch) => {
          if (!batch.length) return resolve();
          entries.push(...batch);
          readBatch();
        }, () => resolve());
      readBatch();
    });
    const nested = await Promise.all(entries.map(collectFilesFromEntry));
    return nested.flat();
  }
  return [];
}

const Upload = () => {
  // Upload queue + analysis loop live in a global provider so they keep running
  // when the user navigates to another section.
  const {
    items,
    status,
    uploading,
    skipped,
    batchSkipped,
    addFiles,
    removeItem,
    resetAll,
    startUpload,
  } = useUpload();

  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  // Lead-sheet (CSV) import
  const [sheetFile, setSheetFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  // Whether a working AI key is configured. Default true so a failed/omitted
  // settings read never wrongly blocks uploads (the backend still enforces it).
  const [aiReady, setAiReady] = useState(true);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const sheetInputRef = useRef(null);

  const handleImportLeads = async () => {
    if (!selectedJobId || !sheetFile || importing) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', sheetFile);
      fd.append('jobId', selectedJobId);
      const res = await api.post('/integrations/leads/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult({ message: res.data.message, summary: res.data.data });
      setSheetFile(null);
      if (sheetInputRef.current) sheetInputRef.current.value = '';
    } catch (err) {
      setImportError(err.response?.data?.message || 'Import failed. Please check the file and try again.');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await api.get('/jobs?status=Active');
        if (res.data.success) {
          setJobs(res.data.data);
          if (res.data.data.length > 0) setSelectedJobId(res.data.data[0]._id);
        }
      } catch (err) {
        console.error('Error fetching jobs', err);
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchJobs();

    // Analysis requires a valid AI key — surface it up front so users don't
    // queue a large batch only to have every file fail.
    api.get('/settings')
      .then((res) => {
        if (res.data?.success) setAiReady(!!res.data.data.aiKeyConfigured);
      })
      .catch(() => { /* leave aiReady=true; backend enforces regardless */ });
  }, []);

  // `webkitdirectory` isn't a standard React prop — set it on the input directly.
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
      folderInputRef.current.setAttribute('mozdirectory', '');
    }
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dt = e.dataTransfer;
    // Prefer the entries API so dropped folders are traversed recursively.
    if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) {
      const entries = [];
      for (let i = 0; i < dt.items.length; i++) {
        const en = dt.items[i].webkitGetAsEntry && dt.items[i].webkitGetAsEntry();
        if (en) entries.push(en);
      }
      if (entries.length) {
        const nested = await Promise.all(entries.map(collectFilesFromEntry));
        addFiles(nested.flat());
        return;
      }
    }
    if (dt.files && dt.files.length) addFiles(dt.files);
  };

  const handleFileChange = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const handleFolderChange = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const handleUpload = () => {
    if (items.length === 0 || !selectedJobId) return;
    const job = jobs.find((j) => j._id === selectedJobId);
    startUpload(selectedJobId, job ? job.title : '');
  };

  const total = items.length;
  const totalBytes = items.reduce((s, it) => s + it.size, 0);
  const doneCount = items.filter((i) => status[i.key]?.state === 'success').length;
  const errorCount = items.filter((i) => status[i.key]?.state === 'error').length;
  const allSuccess = total > 0 && doneCount === total;
  const noJobs = !loadingJobs && jobs.length === 0;
  const atCapacity = total >= MAX_FILES || totalBytes >= MAX_TOTAL_SIZE;

  return (
    <div className="space-y-3 animate-in fade-in duration-300 w-full mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Upload &amp; Analyze Resumes</h2>
          <p className="text-xs text-slate-500">Upload individual files or an entire folder — each resume is parsed and scored against the chosen job.</p>
        </div>
        <Link
          to="/candidates"
          className="flex items-center space-x-1.5 px-4 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
        >
          <Users size={14} />
          <span>View Candidates</span>
        </Link>
      </div>

      {/* AI-not-configured guard */}
      {!aiReady && (
        <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl text-xs">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">AI analysis is not configured.</p>
            <p className="mt-0.5 text-rose-600/90 dark:text-rose-400/90">
              Resumes can only be analyzed once a valid AI API key is added.{' '}
              <Link to="/settings" className="font-semibold underline">Add a working API key in Settings</Link> to enable uploads.
            </p>
          </div>
        </div>
      )}

      {/* Job selector */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Target Job Opening</label>
        {loadingJobs ? (
          <div className="h-11 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse flex items-center px-4">
            <Loader2 size={16} className="animate-spin text-slate-400" />
          </div>
        ) : noJobs ? (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-xs">
            No active jobs found. <Link to="/jobs" className="font-semibold underline">Create a job opening</Link> first, then come back to upload resumes.
          </div>
        ) : (
          <select
            disabled={uploading}
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="block w-full min-w-0 max-w-full h-11 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-700 dark:text-slate-300 truncate focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            {jobs.map((job) => (
              <option key={job._id} value={job._id}>
                {job.title} — {job.department}, {job.location}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Dropzone */}
      <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark">
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition ${
            dragActive
              ? 'border-brand-500 bg-brand-500/5'
              : 'border-slate-300 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/20'
          } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
        >
          <input ref={fileInputRef} type="file" multiple accept={ACCEPT_ATTR} onChange={handleFileChange} className="hidden" />
          <input ref={folderInputRef} type="file" multiple onChange={handleFolderChange} className="hidden" />

          <div className="p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm mb-3.5">
            <UploadIcon size={22} className="text-brand-500" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Drag &amp; drop files or a folder here</p>
          <p className="text-[11px] text-slate-400 mt-1 mb-4">PDF, DOC, DOCX, TXT, RTF or images (JPG/PNG…) — up to 10MB each, {MAX_FILES} files / {fmtMB(MAX_TOTAL_SIZE)}MB per batch. Folders are scanned automatically; images &amp; scanned PDFs are read via OCR.</p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
            >
              <FileText size={14} />
              <span>Browse Files</span>
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center space-x-1.5 px-4 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition"
            >
              <FolderUp size={14} />
              <span>Select Folder</span>
            </button>
          </div>
        </div>

        {skipped > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-3">
            {skipped} file{skipped > 1 ? 's' : ''} skipped (unsupported type or over 10MB).
          </p>
        )}
        {batchSkipped > 0 && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
            {batchSkipped} file{batchSkipped > 1 ? 's' : ''} skipped — batch limit reached ({MAX_FILES} files / {fmtMB(MAX_TOTAL_SIZE)}MB). Upload the current batch, then add more.
          </p>
        )}
      </div>

      {/* Import leads from a CSV (Admin) — creates lead candidates + WhatsApp résumé request */}
      {isAdmin && (
        <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-brand-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Import leads from a sheet</h3>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Upload a <strong>.csv or .xlsx</strong> of leads for the job selected above. Header columns:{' '}
            <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">Name, Email, Phone</code>{' '}
            (an optional <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">Resume URL</code> column).
            Rows without a résumé get an automatic WhatsApp request asking for one.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              ref={sheetInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={importing || noJobs}
              onChange={(e) => { setSheetFile(e.target.files?.[0] || null); setImportResult(null); setImportError(''); }}
              className="block w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-500/10 file:text-brand-600 hover:file:bg-brand-500/20 file:cursor-pointer"
            />
            <button
              type="button"
              onClick={handleImportLeads}
              disabled={!selectedJobId || !sheetFile || importing || noJobs}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-sm transition whitespace-nowrap"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              <span>{importing ? 'Importing…' : 'Import leads'}</span>
            </button>
          </div>
          {importError && (
            <p className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <AlertCircle size={13} /> {importError}
            </p>
          )}
          {importResult && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-700 dark:text-emerald-400 space-y-1">
              <p className="flex items-start gap-1.5"><CheckCircle2 size={13} className="mt-0.5 shrink-0" /> {importResult.message}</p>
              {importResult.summary?.errors?.length > 0 && (
                <ul className="list-disc ml-5 text-emerald-700/80 dark:text-emerald-400/80">
                  {importResult.summary.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected documents */}
      {items.length > 0 && (
        <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">
              Selected Documents ({items.length}/{MAX_FILES})
              <span className={`font-normal ${atCapacity ? 'text-rose-500' : 'text-slate-400'}`}> · {fmtMB(totalBytes)} / {fmtMB(MAX_TOTAL_SIZE)}MB</span>
              {(doneCount > 0 || errorCount > 0) && (
                <span className="text-slate-400 font-normal"> · {doneCount} analyzed{errorCount ? `, ${errorCount} failed` : ''}</span>
              )}
            </p>
            {!uploading && (
              <button onClick={resetAll} className="text-[11px] font-semibold text-slate-400 hover:text-rose-500 transition">
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
            {items.map((it) => {
              const s = status[it.key] || { progress: 0, state: 'idle', message: '' };
              return (
                <div
                  key={it.key}
                  className="flex flex-col p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-darkBorder/60 rounded-xl text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <FileText size={16} className="text-brand-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate block max-w-[260px]">{it.name}</span>
                        {it.relPath && it.relPath !== it.name && (
                          <span className="text-[9.5px] text-slate-400 truncate block max-w-[260px]">{it.relPath}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">({(it.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>

                    {!uploading && s.state !== 'success' ? (
                      <button onClick={() => removeItem(it.key)} className="p-1 text-slate-400 hover:text-rose-500 rounded transition flex-shrink-0">
                        <X size={14} />
                      </button>
                    ) : (
                      <div className="flex items-center flex-shrink-0">
                        {s.state === 'success' && <CheckCircle2 size={15} className="text-emerald-500" />}
                        {s.state === 'error' && <AlertCircle size={15} className="text-rose-500" />}
                        {(s.state === 'uploading' || s.state === 'analyzing') && <Loader2 size={14} className="animate-spin text-brand-500" />}
                      </div>
                    )}
                  </div>

                  {s.state !== 'idle' && (
                    <div className="mt-2 space-y-1">
                      <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            s.state === 'error' ? 'bg-rose-500' : s.state === 'success' ? 'bg-emerald-500' : 'bg-brand-500'
                          }`}
                          style={{ width: `${s.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className={`${s.state === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>{s.message}</span>
                        <span className="font-semibold text-slate-500">{s.state === 'success' ? 'Done' : `${Math.round(s.progress)}%`}</span>
                      </div>
                    </div>
                  )}

                  {s.state === 'success' && s.result && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 pt-2.5 border-t border-slate-200/60 dark:border-darkBorder/40">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Candidate Match</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${scoreBadgeClass(s.result.score)}`}>{s.result.score}%</span>
                        {s.result.matchPercentage != null && (
                          <span className="text-[10px] text-slate-400">Job fit {s.result.matchPercentage}%</span>
                        )}
                        {s.result.candidateId && (
                          <Link to={`/candidates/${s.result.candidateId}`} className="text-[10px] font-semibold text-brand-500 hover:underline">
                            View profile
                          </Link>
                        )}
                      </div>
                      {s.result.recommendation && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${recBadgeClass(s.result.recommendation)}`}>
                          {s.result.recommendation}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-darkBorder">
            {allSuccess ? (
              <>
                <button onClick={resetAll} className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
                  Analyze More
                </button>
                <Link
                  to="/candidates"
                  className="flex items-center space-x-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow transition"
                >
                  <span>View Candidates</span>
                  <ArrowRight size={14} />
                </Link>
              </>
            ) : (
              <button
                onClick={handleUpload}
                disabled={uploading || items.length === 0 || noJobs || !selectedJobId || !aiReady}
                className="flex items-center space-x-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow transition"
              >
                {uploading && <Loader2 size={14} className="animate-spin" />}
                <span>{uploading ? 'Processing...' : `Analyze ${items.length} Resume${items.length > 1 ? 's' : ''}`}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Upload;
