import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api, { API_ORIGIN } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Mail,
  Phone,
  Github,
  Linkedin,
  Globe,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Building,
  GraduationCap,
  FolderGit2,
  ExternalLink,
  Trash2,
  Send,
  Loader2,
  ChevronLeft,
  Plus
} from 'lucide-react';

// Dynamic score coloring: green (strong) / amber (moderate) / red (weak).
const scoreText = (v = 0) =>
  v >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : v >= 60 ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';
const scoreBar = (v = 0) =>
  v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-rose-500';
const scoreBox = (v = 0) =>
  v >= 80 ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40'
    : v >= 60 ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40'
      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40';

const CandidateDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = ['Admin', 'Recruiter'].includes(user?.role);

  // Recruiter Notes state
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const fetchCandidate = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/candidates/${id}`);
      if (res.data.success) {
        setCandidate(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Could not retrieve candidate details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidate();
  }, [id]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setAddingNote(true);
    try {
      const res = await api.post(`/candidates/${id}/notes`, { note: newNote });
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, notes: res.data.data }));
        setNewNote('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this evaluation note?')) return;
    try {
      const res = await api.delete(`/candidates/${id}/notes/${noteId}`);
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, notes: res.data.data }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCandidate = async () => {
    if (
      !window.confirm(
        `Delete ${candidate.name}? This permanently removes the candidate, their AI analysis, notes and the stored resume file. This cannot be undone.`
      )
    )
      return;
    try {
      setDeleting(true);
      const res = await api.delete(`/candidates/${id}`);
      if (res.data.success) {
        navigate('/candidates');
      }
    } catch (err) {
      console.error(err);
      window.alert(err.response?.data?.message || 'Failed to delete candidate.');
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await api.put(`/candidates/${id}/status`, { status: newStatus });
      if (res.data.success) {
        setCandidate((prev) => ({ ...prev, status: res.data.data.status }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <DetailsSkeleton />;
  }

  if (error || !candidate) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <AlertCircle className="text-rose-500 mb-3" size={32} />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{error || 'Candidate profile not found'}</h3>
        <Link to="/candidates" className="text-xs text-brand-500 mt-2 hover:underline flex items-center">
          <ChevronLeft size={14} className="mr-1" /> Back to candidates
        </Link>
      </div>
    );
  }

  const { aiAnalysis } = candidate;

  const scoreCategories = [
    { label: 'Technical Ability', value: aiAnalysis?.technicalScore, expl: aiAnalysis?.explanations?.technical },
    { label: 'Experience Depth', value: aiAnalysis?.experienceScore, expl: aiAnalysis?.explanations?.experience },
    { label: 'Academic Match', value: aiAnalysis?.educationScore, expl: aiAnalysis?.explanations?.education },
    { label: 'Communication Skill', value: aiAnalysis?.communicationScore, expl: aiAnalysis?.explanations?.communication },
    { label: 'Organization Culture Fit', value: aiAnalysis?.cultureFitScore, expl: aiAnalysis?.explanations?.cultureFit },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      
      {/* Back & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2.5 border-b border-slate-200 dark:border-darkBorder">
        <div className="flex items-center space-x-3.5">
          <Link
            to="/candidates"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition"
          >
            <ChevronLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{candidate.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                candidate.aiAnalysis?.overallScore >= 80 ? 'bg-emerald-500/10 text-emerald-600' :
                candidate.aiAnalysis?.overallScore >= 60 ? 'bg-amber-500/10 text-amber-600' :
                'bg-rose-500/10 text-rose-600'
              }`}>
                Job Match: {candidate.aiAnalysis?.overallScore}%
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Candidate for <strong className="text-slate-700 dark:text-slate-300">{candidate.jobId?.title}</strong> ({candidate.jobId?.department})
            </p>
          </div>
        </div>

        {/* Change Stage dropdown */}
        <div className="flex items-center space-x-3">
          {candidate.resumeUrl && (
            <a
              href={/^https?:\/\//.test(candidate.resumeUrl) ? candidate.resumeUrl : `${API_ORIGIN}${candidate.resumeUrl}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-4 py-2 border border-slate-200 dark:border-darkBorder hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              <FileText size={14} />
              <span>Download CV</span>
            </a>
          )}
          
          <select
            value={candidate.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="Applied">Applied</option>
            <option value="Screening">Screening</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Interview">Interview</option>
            <option value="Technical Round">Technical Round</option>
            <option value="HR Round">HR Round</option>
            <option value="Offer">Offer</option>
            <option value="Hired">Hired</option>
            <option value="Rejected">Rejected</option>
          </select>

          {canDelete && (
            <button
              onClick={handleDeleteCandidate}
              disabled={deleting}
              title="Delete candidate & resume"
              className="flex items-center space-x-1.5 px-4 py-2 border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>{deleting ? 'Deleting...' : 'Delete'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        
        {/* Left column: AI scores & summary */}
        <div className="lg:col-span-1 space-y-3">
          {/* Summary & recommendation card */}
          <div className="p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Resume Match Synthesis
            </h3>
            
            <div className="flex items-center space-x-4">
              <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border ${scoreBox(aiAnalysis?.overallScore || 0)}`}>
                <span className={`text-2xl font-black ${scoreText(aiAnalysis?.overallScore || 0)}`}>
                  {aiAnalysis?.overallScore ?? 0}
                </span>
                <span className="text-[8.5px] font-bold text-slate-400 block -mt-1 uppercase">Match</span>
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Analyzer Recommendation</span>
                <span className={`text-sm font-bold block mt-0.5 ${
                  aiAnalysis?.recommendation?.includes('Hire') ? 'text-emerald-500' :
                  aiAnalysis?.recommendation?.includes('Interview') ? 'text-brand-500' : 'text-red-500'
                }`}>
                  {aiAnalysis?.recommendation || 'Proceed to Screening'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic bg-slate-50 dark:bg-slate-900/30 p-3.5 rounded-xl border border-slate-200/40 dark:border-darkBorder/40">
              "{aiAnalysis?.careerSummary || 'AI model is analyzing qualifications...'}"
            </p>

            <div className="space-y-2.5">
              <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Contact Information</span>
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                {candidate.email && (
                  <div className="flex items-center space-x-2">
                    <Mail size={13} className="text-slate-400" />
                    <span>{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone size={13} className="text-slate-400" />
                    <span>{candidate.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Social links */}
            <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 dark:border-darkBorder">
              {candidate.githubUrl && (
                <a href={candidate.githubUrl} target="_blank" rel="noreferrer" className="p-2 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition">
                  <Github size={15} />
                </a>
              )}
              {candidate.linkedInUrl && (
                <a href={candidate.linkedInUrl} target="_blank" rel="noreferrer" className="p-2 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition">
                  <Linkedin size={15} />
                </a>
              )}
              {candidate.portfolioUrl && (
                <a href={candidate.portfolioUrl} target="_blank" rel="noreferrer" className="p-2 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition">
                  <Globe size={15} />
                </a>
              )}
            </div>
          </div>

          {/* Detailed analysis categories */}
          <div className="p-5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-4">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Core Score Split
            </h3>
            
            <div className="space-y-3.5">
              {scoreCategories.map((cat, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <span>{cat.label}</span>
                    <span className={`font-bold ${scoreText(cat.value || 0)}`}>{cat.value}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`${scoreBar(cat.value || 0)} h-full rounded-full transition-all duration-300`}
                      style={{ width: `${cat.value}%` }}
                    />
                  </div>
                  <p className="text-[9.5px] text-slate-400/90 leading-normal">{cat.expl}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Middle/Right columns: parsed lists & notes */}
        <div className="lg:col-span-2 space-y-3">
          
          {/* Skills clouds */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark">
            {/* Matched skills */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider flex items-center">
                <CheckCircle size={14} className="mr-1.5" /> Matched Skills ({aiAnalysis?.matchedSkills?.length || 0})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {aiAnalysis?.matchedSkills?.map((skill, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-md text-[10px] font-medium">
                    {skill}
                  </span>
                ))}
                {(!aiAnalysis?.matchedSkills || aiAnalysis.matchedSkills.length === 0) && (
                  <span className="text-[10px] text-slate-400 italic">No direct matches.</span>
                )}
              </div>
            </div>

            {/* Missing skills */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-rose-500 uppercase tracking-wider flex items-center">
                <XCircle size={14} className="mr-1.5" /> Missing Skills ({aiAnalysis?.missingSkills?.length || 0})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {aiAnalysis?.missingSkills?.map((skill, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-md text-[10px] font-medium">
                    {skill}
                  </span>
                ))}
                {(!aiAnalysis?.missingSkills || aiAnalysis.missingSkills.length === 0) && (
                  <span className="text-[10px] text-slate-400 italic">No missing skills identified!</span>
                )}
              </div>
            </div>
          </div>

          {/* Profile CV Details (Work History, Projects, Academics) */}
          <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-4">
            
            {/* Work History */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                <Building size={14} className="mr-2" /> Professional Experience
              </h3>
              
              <div className="relative border-l border-slate-100 dark:border-slate-800 pl-4 ml-2.5 space-y-5">
                {candidate.experience?.map((exp, idx) => (
                  <div key={idx} className="relative text-xs">
                    {/* Circle Bullet */}
                    <span className="absolute -left-[21.5px] top-0.5 w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-800 border border-white dark:border-darkCard" />
                    
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-200">{exp.title}</h4>
                        <span className="text-[10px] font-semibold text-brand-500">{exp.company}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">{exp.startDate} - {exp.endDate}</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{exp.description}</p>
                  </div>
                ))}
                {(!candidate.experience || candidate.experience.length === 0) && (
                  <p className="text-[10px] text-slate-400 italic">No professional experience listed.</p>
                )}
              </div>
            </div>

            {/* Projects */}
            {candidate.projects && candidate.projects.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-darkBorder">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                  <FolderGit2 size={14} className="mr-2" /> Personal Projects
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {candidate.projects.map((proj, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/35 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl space-y-1">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 text-xs">{proj.title}</h4>
                        {proj.link && (
                          <a href={proj.link} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-500">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-normal">{proj.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education History */}
            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-darkBorder">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                <GraduationCap size={14} className="mr-2" /> Academic Pedigree
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {candidate.education?.map((edu, idx) => (
                  <div key={idx} className="flex space-x-3">
                    <div className="p-2 w-9 h-9 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-darkBorder/60 rounded-xl flex items-center justify-center text-slate-400 flex-shrink-0">
                      <GraduationCap size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 leading-snug">{edu.degree} in {edu.fieldOfStudy}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{edu.school} ({edu.startYear} - {edu.endYear})</p>
                    </div>
                  </div>
                ))}
                {(!candidate.education || candidate.education.length === 0) && (
                  <p className="text-[10px] text-slate-400 italic">No academic history parsed.</p>
                )}
              </div>
            </div>

          </div>

          {/* Recruiter Evaluation Notes Section */}
          <div className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-xl shadow-premium dark:shadow-premium-dark space-y-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Recruiter Evaluation History
            </h3>
            
            {/* Notes history list */}
            <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
              {candidate.notes?.map((n) => (
                <div key={n._id} className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-[10.5px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{n.author?.name || 'Recruiter'}</span>
                      <span className="text-slate-400">({n.author?.role})</span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-slate-400">
                        {new Date(n.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal pr-4">{n.note}</p>
                  </div>
                  
                  {/* Delete note (Only auth-user can do) */}
                  {(n.author?._id === user?._id || user?.role === 'Admin') && (
                    <button
                      onClick={() => handleDeleteNote(n._id)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded transition flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {(!candidate.notes || candidate.notes.length === 0) && (
                <div className="text-center py-6 text-slate-400 italic text-xs">
                  No evaluations logged yet.
                </div>
              )}
            </div>

            {/* Note submission input */}
            <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-slate-100 dark:border-darkBorder">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log a recruiter interview note or screening evaluation..."
                className="flex-1 h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={addingNote || !newNote.trim()}
                className="px-4.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition shadow-sm"
              >
                {addingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </form>

          </div>

        </div>

      </div>

    </div>
  );
};

// Skeletons
const DetailsSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-6">
        <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
      <div className="lg:col-span-2 space-y-6">
        <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-56 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
    </div>
  </div>
);

export default CandidateDetails;
