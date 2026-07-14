import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Plus,
  Search,
  MapPin,
  DollarSign,
  Briefcase,
  Users,
  SlidersHorizontal,
  MoreVertical,
  Edit2,
  Copy,
  Archive,
  XCircle,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

const Jobs = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({ departments: [], locations: [] });

  // Advanced filters
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedLoc, setSelectedLoc] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Active');
  const [showFilters, setShowFilters] = useState(false);

  // Active actions dropdowns
  const [activeMenuId, setActiveMenuId] = useState(null);

  const isHR = ['Admin', 'Recruiter'].includes(user?.role);
  // Managing existing jobs stays HR-only; creating a new opening is open to
  // Hiring Managers too.
  const canCreateJob = ['Admin', 'Recruiter', 'Hiring Manager'].includes(user?.role);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (selectedDept) queryParams.append('department', selectedDept);
      if (selectedLoc) queryParams.append('location', selectedLoc);
      if (selectedStatus) queryParams.append('status', selectedStatus);

      const res = await api.get(`/jobs?${queryParams.toString()}`);
      if (res.data.success) {
        setJobs(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to retrieve job board postings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [search, selectedDept, selectedLoc, selectedStatus]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/settings');
        if (res.data.success) {
          setSettings(res.data.data);
        }
      } catch (err) {
        console.error('Error fetching global settings for jobs board', err);
      }
    };
    fetchSettings();
  }, []);

  const handleEditJob = (job) => {
    setActiveMenuId(null);
    navigate(`/jobs/${job._id}/edit`);
  };

  const handleCloseJob = async (jobId) => {
    try {
      await api.put(`/jobs/${jobId}/close`);
      fetchJobs();
      setActiveMenuId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchiveJob = async (jobId) => {
    try {
      await api.put(`/jobs/${jobId}/archive`);
      fetchJobs();
      setActiveMenuId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Re-activate: reopen a Closed job, publish a Draft, or restore an Archived one.
  const handleActivateJob = async (jobId) => {
    try {
      await api.put(`/jobs/${jobId}/activate`);
      fetchJobs();
      setActiveMenuId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicateJob = async (jobId) => {
    try {
      await api.post(`/jobs/${jobId}/duplicate`);
      fetchJobs();
      setActiveMenuId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Warning: Deleting this job will also delete all associated candidates and parsing analyses. Proceed?')) return;
    try {
      await api.delete(`/jobs/${jobId}`);
      fetchJobs();
      setActiveMenuId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Use departments and locations from global custom settings
  const departments = settings.departments;
  const locations = settings.locations;

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Job Postings Board</h2>
          <p className="text-xs text-slate-500">Manage openings and track associated talent pipelines.</p>
        </div>
        {canCreateJob && (
          <Link
            to="/jobs/new"
            className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/10 transition"
          >
            <Plus size={16} />
            <span>Create New Job</span>
          </Link>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl p-4 shadow-premium dark:shadow-premium-dark space-y-3.5">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by job title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          {/* Toggle Button for Mobile */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`lg:hidden flex items-center justify-center w-10 h-10 border border-slate-200 dark:border-darkBorder rounded-xl text-slate-600 dark:text-slate-400 focus:outline-none transition-all ${showFilters ? 'bg-[#c5a880]/15 border-[#c5a880] text-[#c5a880]' : 'bg-white dark:bg-slate-900'}`}
            title="Toggle Advanced Filters"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        {/* Advanced Filters: Collapsible on mobile, always visible on desktop */}
        <div className={`${showFilters ? 'flex animate-in fade-in slide-in-from-top-2 duration-200' : 'hidden'} lg:flex flex-col lg:flex-row gap-3 w-full`}>
          {/* Dept dropdown */}
          <div className="w-full lg:w-48">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Location dropdown */}
          <div className="w-full lg:w-48">
            <select
              value={selectedLoc}
              onChange={(e) => setSelectedLoc(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Status filters */}
          <div className="w-full lg:w-48">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="Active">Active Postings</option>
              <option value="Closed">Closed Openings</option>
              <option value="Draft">Draft Openings</option>
              <option value="Archived">Archived Openings</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center">
          <AlertCircle size={16} className="mr-2" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-6 border border-dashed border-slate-200 dark:border-darkBorder rounded-2xl bg-white dark:bg-darkCard text-center">
          <Briefcase className="text-slate-300 dark:text-slate-700 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Job Postings Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
            We couldn't find any job matches. Create an opening to upload candidate resumes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {jobs.map((job) => (
            <div
              key={job._id}
              className={`p-4 border rounded-2xl shadow-premium dark:shadow-premium-dark relative flex flex-col justify-between transition ${
                job.status === 'Closed'
                  ? 'bg-slate-50/50 dark:bg-slate-900/10 border-slate-200 dark:border-darkBorder/40'
                  : 'bg-white dark:bg-darkCard border-slate-200/80 dark:border-darkBorder'
              }`}
            >
              {/* Card Header */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">
                    {job.department}
                  </span>
                  
                  {/* Dropdown Options */}
                  {isHR && (
                    <div className="relative">
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === job._id ? null : job._id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <MoreVertical size={15} />
                      </button>

                      {activeMenuId === job._id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                          <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl shadow-lg py-1.5 z-20 text-xs">
                            <button
                              onClick={() => handleEditJob(job)}
                              className="flex items-center w-full px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-left"
                            >
                              <Edit2 size={13} className="mr-2" /> Edit Posting
                            </button>
                            <button
                              onClick={() => handleDuplicateJob(job._id)}
                              className="flex items-center w-full px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-left"
                            >
                              <Copy size={13} className="mr-2" /> Duplicate Job
                            </button>
                            {job.status !== 'Active' && (
                              <button
                                onClick={() => handleActivateJob(job._id)}
                                className="flex items-center w-full px-3.5 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 text-left"
                              >
                                <CheckCircle2 size={13} className="mr-2" />
                                {job.status === 'Closed' ? 'Reopen Opening' : job.status === 'Draft' ? 'Publish Job' : 'Restore Job'}
                              </button>
                            )}
                            {job.status === 'Active' && (
                              <button
                                onClick={() => handleCloseJob(job._id)}
                                className="flex items-center w-full px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-left"
                              >
                                <XCircle size={13} className="mr-2" /> Close Opening
                              </button>
                            )}
                            {job.status !== 'Archived' && (
                              <button
                                onClick={() => handleArchiveJob(job._id)}
                                className="flex items-center w-full px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-left text-slate-500"
                              >
                                <Archive size={13} className="mr-2" /> Archive Job
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteJob(job._id)}
                              className="flex items-center w-full px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 text-left border-t border-slate-100 dark:border-slate-800"
                            >
                              <Trash2 size={13} className="mr-2" /> Delete Job
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1 line-clamp-1">
                  {job.title}
                </h3>
                
                {/* Stats indicators */}
                <div className="flex flex-wrap gap-y-1.5 items-center text-[10.5px] text-slate-400 mt-2.5 space-x-3.5">
                  <span className="flex items-center">
                    <MapPin size={12} className="mr-1" /> {job.location}
                  </span>
                  {job.salaryRange && (
                    <span className="flex items-center">
                      <DollarSign size={12} className="mr-0.5" /> {job.salaryRange}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold uppercase text-[9px]">
                    {job.employmentType}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3.5 line-clamp-2 leading-relaxed">
                  {job.description}
                </p>

                {/* Required Skills Cloud */}
                <div className="flex flex-wrap gap-1 mt-4">
                  {job.requiredSkills.slice(0, 3).map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-brand-50 dark:bg-brand-950/40 border border-brand-100/50 dark:border-brand-900/30 text-brand-600 dark:text-brand-400 rounded-md text-[10px] font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                  {job.requiredSkills.length > 3 && (
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-md text-[10px]">
                      +{job.requiredSkills.length - 3} more
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100 dark:border-darkBorder">
                <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
                  <Users size={14} className="text-slate-400" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">{job.candidateCount}</strong> Applicants
                  </span>
                </div>
                
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  job.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                  job.status === 'Closed' ? 'bg-rose-500/10 text-rose-600' :
                  'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}>
                  {job.status}
                </span>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default Jobs;
