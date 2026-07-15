import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePosterExtraction } from '../context/PosterExtractionContext';
import LocationSearchInput from '../components/LocationSearchInput';
import { ChevronLeft, Loader2, AlertCircle, Sparkles, UploadCloud, CheckCircle2, X, Plus, Trash2, ClipboardList } from 'lucide-react';

const emptyForm = {
  title: '',
  department: '',
  location: '',
  employmentType: 'Full-time',
  salaryRange: '',
  experience: '',
  numberOpenings: 1,
  requiredSkills: '',
  preferredSkills: '',
  description: '',
  screeningQuestions: '', // one per line; shown on the public application form
};

const JobForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHR = ['Admin', 'Recruiter'].includes(user?.role);

  const [settings, setSettings] = useState({ departments: [], locations: [] });
  const [formData, setFormData] = useState(emptyForm);
  const [quiz, setQuiz] = useState({ timeLimitMinutes: '', questions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // AI poster extraction lives in a root-level context so the operation (and its
  // result) survives navigating away from this form mid-extraction.
  const poster = usePosterExtraction();

  // Bottom-right toast notification
  const [toast, setToast] = useState({ type: '', message: '' });

  // Auto-dismiss the toast after a few seconds.
  useEffect(() => {
    if (!toast.message) return undefined;
    const t = setTimeout(() => setToast({ type: '', message: '' }), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Anyone (incl. Hiring Managers) may create a new opening, but only
  // Admin/Recruiter may edit an existing one.
  useEffect(() => {
    if (user && isEdit && !isHR) navigate('/jobs', { replace: true });
  }, [user, isHR, isEdit, navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        const sRes = await api.get('/settings');
        const s = sRes.data.success ? sRes.data.data : { departments: [], locations: [] };
        setSettings(s);

        if (isEdit) {
          const jRes = await api.get(`/jobs/${id}`);
          if (jRes.data.success) {
            const job = jRes.data.data;
            setFormData({
              title: job.title || '',
              department: job.department || '',
              location: job.location || '',
              employmentType: job.employmentType || 'Full-time',
              salaryRange: job.salaryRange || '',
              experience: job.experience || '',
              numberOpenings: job.numberOpenings || 1,
              requiredSkills: (job.requiredSkills || []).join(', '),
              preferredSkills: (job.preferredSkills || []).join(', '),
              description: job.description || '',
              screeningQuestions: (job.screeningQuestions || []).join('\n'),
            });
            const q = job.quiz && job.quiz.questions ? job.quiz : { timeLimitMinutes: '', questions: [] };
            setQuiz({ timeLimitMinutes: q.timeLimitMinutes || '', questions: q.questions || [] });
          } else {
            setError('Job not found.');
          }
        } else {
          setFormData((prev) => ({
            ...prev,
            department: s.departments?.[0] || '',
          }));
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load form data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- Quiz builder handlers ---
  const addQuestion = (type) =>
    setQuiz((q) => ({
      ...q,
      questions: [
        ...q.questions,
        type === 'mcq'
          ? { id: `q${Date.now()}`, type: 'mcq', question: '', options: ['', ''], correctIndex: 0 }
          : { id: `q${Date.now()}`, type: 'text', question: '' },
      ],
    }));
  const updateQuestion = (i, patch) =>
    setQuiz((q) => ({ ...q, questions: q.questions.map((qq, idx) => (idx === i ? { ...qq, ...patch } : qq)) }));
  const removeQuestion = (i) =>
    setQuiz((q) => ({ ...q, questions: q.questions.filter((_, idx) => idx !== i) }));
  const updateOption = (qi, oi, val) =>
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((qq, idx) =>
        idx === qi ? { ...qq, options: qq.options.map((o, j) => (j === oi ? val : o)) } : qq
      ),
    }));
  const addOption = (qi) =>
    setQuiz((q) => ({ ...q, questions: q.questions.map((qq, idx) => (idx === qi ? { ...qq, options: [...qq.options, ''] } : qq)) }));
  const removeOption = (qi, oi) =>
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((qq, idx) => {
        if (idx !== qi) return qq;
        const options = qq.options.filter((_, j) => j !== oi);
        let correctIndex = qq.correctIndex;
        if (oi === correctIndex) correctIndex = 0;
        else if (oi < correctIndex) correctIndex -= 1;
        return { ...qq, options, correctIndex };
      }),
    }));

  // Upload a hiring poster; the AI extraction runs in the shared context so it
  // isn't lost if the user navigates away before it finishes.
  const handlePosterUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setError('');
    poster.extractPoster(file);
  };

  // Apply a finished poster extraction to the form fields. This runs whether the
  // extraction completed while on this page or while the user was away and has
  // now returned to the Create Job form.
  useEffect(() => {
    if (isEdit || loading) return;
    if (poster.status === 'ready' && poster.result) {
      const d = poster.result;
      setFormData((prev) => ({
        ...prev,
        title: d.title || prev.title,
        department: d.department || prev.department,
        location: d.location || prev.location,
        employmentType: d.employmentType || prev.employmentType,
        salaryRange: d.salaryRange || prev.salaryRange,
        experience: d.experience || prev.experience,
        numberOpenings: d.numberOpenings || prev.numberOpenings,
        requiredSkills: Array.isArray(d.requiredSkills) ? d.requiredSkills.join(', ') : prev.requiredSkills,
        preferredSkills: Array.isArray(d.preferredSkills) ? d.preferredSkills.join(', ') : prev.preferredSkills,
        description: d.description || prev.description,
      }));
      poster.consumeResult();
      setToast({ type: 'success', message: 'Job details filled from the poster. Review and post.' });
    } else if (poster.status === 'error' && poster.error) {
      setToast({ type: 'error', message: poster.error });
      poster.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poster.status, poster.result, poster.error, loading, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...formData,
        requiredSkills: formData.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        preferredSkills: formData.preferredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        screeningQuestions: formData.screeningQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
        quiz: {
          timeLimitMinutes: quiz.timeLimitMinutes ? Number(quiz.timeLimitMinutes) : null,
          questions: quiz.questions,
        },
      };
      const res = isEdit ? await api.put(`/jobs/${id}`, payload) : await api.post('/jobs', payload);
      if (res.data.success) {
        navigate('/jobs');
      } else {
        setError('Could not save the job posting.');
        setSaving(false);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error saving job posting.');
      setSaving(false);
    }
  };

  // Ensure the current value is always selectable, even if settings changed.
  const departments = settings.departments || [];
  const deptOptions = formData.department && !departments.includes(formData.department)
    ? [formData.department, ...departments]
    : departments;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={28} className="animate-spin text-brand-500" />
      </div>
    );
  }

  const inputClass =
    'w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';
  const selectClass =
    'w-full h-10 px-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';
  const labelClass = 'text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider';

  return (
    <div className="space-y-3 animate-in fade-in duration-300 w-full mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3.5 pb-2.5 border-b border-slate-200 dark:border-darkBorder">
        <Link
          to="/jobs"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-darkBorder rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition"
        >
          <ChevronLeft size={16} />
        </Link>
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
            {isEdit ? 'Edit Job Posting' : 'Post New Job Opening'}
          </h2>
          <p className="text-xs text-slate-500">Define job specifications and skill thresholds.</p>
        </div>

        {/* AI poster extraction — top-right, only when creating a new job */}
        {!isEdit && (
          <label
            title="Upload a hiring poster and let AI auto-fill the fields below"
            className={`ml-auto flex items-center space-x-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl shadow cursor-pointer transition ${
              poster.status === 'extracting'
                ? 'bg-slate-200 text-slate-400 dark:bg-slate-800 cursor-not-allowed'
                : 'bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white'
            }`}
          >
            {poster.status === 'extracting' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>{poster.status === 'extracting' ? 'Reading poster…' : 'Fill from Poster'}</span>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              disabled={poster.status === 'extracting'}
              onChange={handlePosterUpload}
            />
          </label>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center">
          <AlertCircle size={16} className="mr-2" />
          <span>{error}</span>
        </div>
      )}

      {/* Poster extraction status line (while running) */}
      {!isEdit && poster.status === 'extracting' && (
        <div className="flex items-center text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
          <UploadCloud size={13} className="mr-1.5 text-brand-500" />
          <span className="truncate">
            Extracting details from “{poster.posterName}”… You can keep working — this continues if you switch sections.
          </span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="p-4 bg-white dark:bg-darkCard border border-slate-200/60 dark:border-darkBorder rounded-2xl shadow-premium dark:shadow-premium-dark space-y-3"
      >
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={labelClass}>Job Title</label>
            <input type="text" required name="title" value={formData.title} onChange={handleInputChange} placeholder="Senior Full Stack Engineer" className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Department</label>
            <select required name="department" value={formData.department} onChange={handleInputChange} className={selectClass}>
              <option value="">Select Department</option>
              {deptOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={labelClass}>Location</label>
            <LocationSearchInput
              value={formData.location}
              onChange={(val) => setFormData((f) => ({ ...f, location: val }))}
              placeholder="Start typing a city…"
              className={selectClass}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Employment Type</label>
            <select name="employmentType" value={formData.employmentType} onChange={handleInputChange} className={selectClass}>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3  gap-4">
          <div className="space-y-1 col-span-2">
            <label className={labelClass}>Salary Range</label>
            <input type="text" name="salaryRange" value={formData.salaryRange} onChange={handleInputChange} placeholder="e.g. $120,000 - $150,000" className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Openings</label>
            <input type="number" min="1" name="numberOpenings" value={formData.numberOpenings} onChange={handleInputChange} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className={labelClass}>Experience Level Requirement</label>
            <input type="text" required name="experience" value={formData.experience} onChange={handleInputChange} placeholder="e.g. 5+ Years, Mid-Senior level" className={inputClass} />
          </div>
  
          <div className="space-y-1">
            <label className={labelClass}>Required Skills (Comma separated)</label>
            <input type="text" required name="requiredSkills" value={formData.requiredSkills} onChange={handleInputChange} placeholder="e.g. JavaScript, React, Node.js, Mongoose" className={inputClass} />
          </div>
  
          <div className="space-y-1">
            <label className={labelClass}>Preferred Skills (Comma separated)</label>
            <input type="text" name="preferredSkills" value={formData.preferredSkills} onChange={handleInputChange} placeholder="e.g. AWS, Docker, Kubernetes" className={inputClass} />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Full Job Description</label>
          <textarea
            required
            name="description"
            rows="5"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Summarize role requirements, team profiles, and daily tasks..."
            className="w-full p-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y"
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Screening Questions (optional — one per line)</label>
          <textarea
            name="screeningQuestions"
            rows="3"
            value={formData.screeningQuestions}
            onChange={handleInputChange}
            placeholder={'Why do you want this role?\nWhat is your notice period?'}
            className="w-full p-3 border border-slate-200 dark:border-darkBorder rounded-xl bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y"
          />
          <p className="text-[10px] text-slate-400">Shown to applicants on the public careers page (/careers).</p>
        </div>

        {/* Screening quiz builder */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-darkBorder">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className={`${labelClass} flex items-center`}>
              <ClipboardList size={13} className="mr-1.5 text-brand-500" /> Screening Quiz (optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" placeholder="Time limit (min)"
                value={quiz.timeLimitMinutes}
                onChange={(e) => setQuiz((q) => ({ ...q, timeLimitMinutes: e.target.value }))}
                className="h-8 w-32 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none"
              />
              <button type="button" onClick={() => addQuestion('mcq')} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 h-8 rounded-lg bg-brand-500/10 text-brand-600 border border-brand-500/20 hover:bg-brand-500/20 transition">
                <Plus size={12} /> MCQ
              </button>
              <button type="button" onClick={() => addQuestion('text')} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                <Plus size={12} /> Text
              </button>
            </div>
          </div>

          {quiz.questions.length === 0 ? (
            <p className="text-[10px] text-slate-400">Add multiple-choice (auto-scored) or open-text questions applicants answer when they apply.</p>
          ) : (
            <div className="space-y-2.5">
              {quiz.questions.map((q, qi) => (
                <div key={q.id} className="p-3 bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-darkBorder/40 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${q.type === 'mcq' ? 'bg-brand-500/10 text-brand-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                      {q.type === 'mcq' ? 'MCQ' : 'TEXT'}
                    </span>
                    <input
                      value={q.question}
                      onChange={(e) => updateQuestion(qi, { question: e.target.value })}
                      placeholder={`Question ${qi + 1}`}
                      className="flex-1 h-8 px-2.5 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                    <button type="button" onClick={() => removeQuestion(qi)} className="p-1 text-slate-400 hover:text-rose-500 transition"><Trash2 size={14} /></button>
                  </div>
                  {q.type === 'mcq' && (
                    <div className="space-y-1.5 pl-1">
                      {q.options.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio" name={`correct-${q.id}`} checked={q.correctIndex === oi}
                            onChange={() => updateQuestion(qi, { correctIndex: oi })}
                            title="Mark as the correct answer"
                            className="accent-emerald-600"
                          />
                          <input
                            value={o}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            placeholder={`Option ${oi + 1}`}
                            className="flex-1 h-7 px-2 border border-slate-200 dark:border-darkBorder rounded-lg bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none"
                          />
                          {q.options.length > 2 && (
                            <button type="button" onClick={() => removeOption(qi, oi)} className="p-0.5 text-slate-400 hover:text-rose-500"><X size={13} /></button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addOption(qi)} className="flex items-center gap-1 text-[10px] font-semibold text-brand-500 hover:text-brand-600">
                        <Plus size={11} /> Add option
                      </button>
                      <p className="text-[9px] text-slate-400">Select the radio next to the correct answer (auto-scored).</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-darkBorder">
          <button
            type="button"
            onClick={() => navigate('/jobs')}
            className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center space-x-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow transition"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>{isEdit ? 'Save Changes' : 'Post Opening'}</span>
          </button>
        </div>
      </form>

      {/* Bottom-right toast for poster-extraction feedback */}
      {toast.message && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-md px-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs shadow-xl border bg-white dark:bg-slate-900 ${
            toast.type === 'success'
              ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}>
            {toast.type === 'success'
              ? <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
              : <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />}
            <span className="font-medium flex-1">{toast.message}</span>
            <button
              onClick={() => setToast({ type: '', message: '' })}
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

export default JobForm;
