import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../services/api';

// Holds the "create a job from a hiring poster" AI extraction at the app root,
// so the operation keeps running (and its result is kept) even when the user
// navigates away from the Create Job form mid-extraction.
const PosterExtractionContext = createContext(null);

export const usePosterExtraction = () => {
  const ctx = useContext(PosterExtractionContext);
  if (!ctx) throw new Error('usePosterExtraction must be used within a PosterExtractionProvider');
  return ctx;
};

// A result counts as usable only if the AI actually found something to fill.
const hasUsableData = (d) =>
  Boolean(
    (d.title && d.title.trim()) ||
      (d.description && d.description.trim()) ||
      (Array.isArray(d.requiredSkills) && d.requiredSkills.length > 0)
  );

export const PosterExtractionProvider = ({ children }) => {
  const [status, setStatus] = useState('idle'); // idle | extracting | ready | error
  const [posterName, setPosterName] = useState('');
  const [result, setResult] = useState(null); // extracted job fields, awaiting the form
  const [error, setError] = useState('');

  const extractPoster = useCallback(async (file) => {
    if (!file) return;
    setStatus('extracting');
    setPosterName(file.name);
    setResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('poster', file);
      const res = await api.post('/jobs/extract-poster', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success && hasUsableData(res.data.data || {})) {
        setResult(res.data.data);
        setStatus('ready');
      } else if (res.data.success) {
        setStatus('error');
        setError('AI could not find any job details in this poster. Please try a clearer image or fill the form manually.');
      } else {
        setStatus('error');
        setError(res.data.message || 'Could not extract details from the poster.');
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
      setError(err.response?.data?.message || 'Failed to extract details from the poster.');
    }
  }, []);

  // The form calls this once it has applied `result` to its fields.
  const consumeResult = useCallback(() => {
    setResult(null);
    setPosterName('');
    setStatus('idle');
  }, []);

  // Dismiss an error / reset everything.
  const clear = useCallback(() => {
    setStatus('idle');
    setPosterName('');
    setResult(null);
    setError('');
  }, []);

  const value = { status, posterName, result, error, extractPoster, consumeResult, clear };
  return <PosterExtractionContext.Provider value={value}>{children}</PosterExtractionContext.Provider>;
};

export default PosterExtractionContext;
