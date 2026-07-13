import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Columns, Briefcase, ChevronRight, User, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const PIPELINE_STAGES = [
  'Applied',
  'Screening',
  'Shortlisted',
  'Interview',
  'Technical Round',
  'HR Round',
  'Offer',
  'Hired',
  'Rejected'
];

const STAGE_COLORS = {
  'Applied': 'border-t-slate-400 bg-slate-500/5',
  'Screening': 'border-t-blue-400 bg-blue-500/5',
  'Shortlisted': 'border-t-indigo-400 bg-indigo-500/5',
  'Interview': 'border-t-purple-400 bg-purple-500/5',
  'Technical Round': 'border-t-pink-400 bg-pink-500/5',
  'HR Round': 'border-t-orange-400 bg-orange-500/5',
  'Offer': 'border-t-teal-400 bg-teal-500/5',
  'Hired': 'border-t-emerald-500 bg-emerald-500/10',
  'Rejected': 'border-t-rose-500 bg-rose-500/5'
};

const Pipeline = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  
  // HTML5 Drag States
  const [draggedCandId, setDraggedCandId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const isHR = ['Admin', 'Recruiter'].includes(user?.role);

  // --- Edge auto-scroll while dragging -------------------------------------
  // During an HTML5 drag the board won't scroll on its own, so the off-screen
  // stages (e.g. Hired / Rejected) are unreachable. While a card is dragged we
  // run a timer that scrolls the board when the pointer nears the left/right
  // edge, based on the last pointer X reported by the board's onDragOver.
  const boardRef = useRef(null);
  const pointerXRef = useRef(0);
  const scrollTimerRef = useRef(null);

  const EDGE_ZONE = 90; // px from an edge that triggers scrolling
  const MAX_SPEED = 22; // px per tick at the very edge

  const startAutoScroll = () => {
    if (scrollTimerRef.current) return;
    scrollTimerRef.current = setInterval(() => {
      const el = boardRef.current;
      const x = pointerXRef.current;
      if (!el || !x) return;
      const rect = el.getBoundingClientRect();
      if (x < rect.left + EDGE_ZONE) {
        // Closer to the edge → faster scroll.
        const intensity = (rect.left + EDGE_ZONE - x) / EDGE_ZONE;
        el.scrollLeft -= Math.ceil(MAX_SPEED * Math.min(1, intensity));
      } else if (x > rect.right - EDGE_ZONE) {
        const intensity = (x - (rect.right - EDGE_ZONE)) / EDGE_ZONE;
        el.scrollLeft += Math.ceil(MAX_SPEED * Math.min(1, intensity));
      }
    }, 16);
  };

  const stopAutoScroll = () => {
    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
    pointerXRef.current = 0;
  };

  // Safety net: clear the timer if the component unmounts mid-drag.
  useEffect(() => () => stopAutoScroll(), []);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await api.get('/jobs?status=Active');
        if (res.data.success) {
          setJobs(res.data.data);
          if (res.data.data.length > 0) {
            setSelectedJobId(res.data.data[0]._id);
          }
        }
      } catch (err) {
        console.error('Error fetching jobs', err);
      }
    };
    fetchJobs();
  }, []);

  const fetchCandidates = async () => {
    if (!selectedJobId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.get(`/candidates?jobId=${selectedJobId}`);
      if (res.data.success) {
        setCandidates(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [selectedJobId]);

  // Drag and Drop implementation
  const handleDragStart = (e, candidateId) => {
    if (!isHR) {
      e.preventDefault();
      return;
    }
    setDraggedCandId(candidateId);
    e.dataTransfer.setData('text/plain', candidateId);
    e.dataTransfer.effectAllowed = 'move';
    startAutoScroll();
  };

  // Called when the drag ends for any reason (drop, or released outside a column).
  const handleDragEnd = () => {
    stopAutoScroll();
    setDraggedCandId(null);
    setDragOverColumn(null);
  };

  // Track the pointer across the whole board so the auto-scroll timer knows
  // which edge to push toward. preventDefault keeps the board a valid drop area.
  const handleBoardDragOver = (e) => {
    e.preventDefault();
    pointerXRef.current = e.clientX;
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
  };

  const handleDragEnter = (e, stage) => {
    e.preventDefault();
    if (isHR) {
      setDragOverColumn(stage);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    setDragOverColumn(null);
    stopAutoScroll();

    const candidateId = e.dataTransfer.getData('text/plain') || draggedCandId;
    if (!candidateId || !isHR) return;

    // Find the candidate locally to check if status is actually changing
    const candidate = candidates.find(c => c._id === candidateId);
    if (candidate && candidate.status === targetStage) return;

    setUpdatingId(candidateId);
    try {
      // Optimistic Local State Update
      setCandidates((prev) =>
        prev.map((c) => (c._id === candidateId ? { ...c, status: targetStage } : c))
      );

      const res = await api.put(`/candidates/${candidateId}/status`, { status: targetStage });
      if (!res.data.success) {
        // Revert on error
        fetchCandidates();
      }
    } catch (err) {
      console.error(err);
      fetchCandidates();
    } finally {
      setUpdatingId(null);
      setDraggedCandId(null);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10';
    if (score >= 60) return 'text-amber-500 bg-amber-500/10';
    return 'text-rose-500 bg-rose-500/10';
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300 flex flex-col h-[calc(100vh-140px)]">
      
      {/* Title & Select Job */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Hiring Pipeline Board</h2>
          <p className="text-xs text-slate-500">
            {isHR ? 'Drag and drop applicant profile cards across status stages.' : 'View current progression steps of applicants.'}
          </p>
        </div>

        {/* Job selector */}
        <div className="flex items-center space-x-2 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder px-3 py-1.5 rounded-lg shadow-sm">
          <Briefcase size={14} className="text-slate-400" />
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="border-none bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            {jobs.length === 0 ? (
              <option value="">No Active Job Openings</option>
            ) : (
              jobs.map((j) => (
                <option key={j._id} value={j._id}>{j.title}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Board Zone */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-brand-500" />
        </div>
      ) : !selectedJobId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center border border-dashed border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-darkCard">
          <AlertCircle className="text-slate-300 dark:text-slate-700 mb-3" size={36} />
          <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400">No Job Profile Selected</h3>
          <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
            Create an active job opening first to begin managing pipelines.
          </p>
        </div>
      ) : (
        <div
          ref={boardRef}
          onDragOver={handleBoardDragOver}
          onDragEnd={handleDragEnd}
          className="flex-1 overflow-x-auto flex space-x-4 pb-4 select-none pr-1"
        >
          {PIPELINE_STAGES.map((stage) => {
            const stageCandidates = candidates.filter((c) => c.status === stage);
            const isHovered = dragOverColumn === stage;

            return (
              <div
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragEnter={(e) => handleDragEnter(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
                className={`w-64 rounded-2xl flex flex-col border-t-4 border-l border-r border-b border-slate-200/50 dark:border-darkBorder/40 transition-all flex-shrink-0 ${
                  STAGE_COLORS[stage]
                } ${isHovered ? 'ring-2 ring-brand-500 scale-[1.01]' : ''}`}
              >
                {/* Column header */}
                <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-200/40 dark:border-darkBorder/20 bg-white/40 dark:bg-darkCard/20">
                  <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                    {stage}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-500">
                    {stageCandidates.length}
                  </span>
                </div>

                {/* Candidate cards container */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 min-h-[380px]">
                  {stageCandidates.map((cand) => (
                    <div
                      key={cand._id}
                      draggable={isHR}
                      onDragStart={(e) => handleDragStart(e, cand._id)}
                      onDragEnd={handleDragEnd}
                      className={`p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-sm relative transition ${
                        isHR ? 'cursor-grab active:cursor-grabbing hover:shadow hover:border-brand-300 dark:hover:border-brand-800' : 'cursor-default'
                      } ${updatingId === cand._id ? 'opacity-40 animate-pulse' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug truncate pr-3 max-w-[130px]">
                          {cand.name}
                        </h4>
                        <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${getScoreColor(cand.aiAnalysis?.overallScore || 0)}`}>
                          {cand.aiAnalysis?.overallScore || 0}%
                        </span>
                      </div>

                      {/* Details links */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-darkBorder/50">
                        <span className="text-[9.5px] text-slate-400 font-medium">
                          Skills Match: {cand.aiAnalysis?.matchedSkills?.length || 0}
                        </span>
                        
                        <Link
                          to={`/candidates/${cand._id}`}
                          className="flex items-center space-x-0.5 text-[9.5px] font-bold text-brand-500 hover:text-brand-600 hover:underline"
                        >
                          <span>Review</span>
                          <ChevronRight size={10} />
                        </Link>
                      </div>

                    </div>
                  ))}
                  
                  {stageCandidates.length === 0 && (
                    <div className="h-full flex items-center justify-center text-center p-3 border border-dashed border-slate-200/30 dark:border-darkBorder/10 rounded-xl">
                      <span className="text-[10px] text-slate-400 italic">Stage Empty</span>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default Pipeline;
