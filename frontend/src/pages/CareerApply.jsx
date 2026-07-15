import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import portalApi from '../services/portalApi';
import { useApplicantAuth } from '../context/ApplicantAuthContext';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import LocationSearchInput from '../components/LocationSearchInput';
import RichText from '../utils/richText';
import {
  Briefcase, MapPin, Clock, ChevronLeft, Loader2, UploadCloud,
  CheckCircle2, AlertCircle, FileText, ClipboardList, AlertTriangle, ArrowRight,
  ChevronDown
} from 'lucide-react';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const ACCEPT = '.pdf,.doc,.docx,.txt,.rtf,image/*';
const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB — matches the server limit

const CareerApply = () => {
  const { id } = useParams();
  const { applicant } = useApplicantAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [appliedAppId, setAppliedAppId] = useState(null); // set if a logged-in applicant already applied to THIS job
  const [hasPrimaryResume, setHasPrimaryResume] = useState(false); // logged-in applicant has a saved résumé
  const [usePrimaryResume, setUsePrimaryResume] = useState(true);
  const [primaryResumeName, setPrimaryResumeName] = useState('');

  const [showForm, setShowForm] = useState(false); // Toggle to show application wizard
  const [descExpanded, setDescExpanded] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '', currentLocation: '', salaryExpectation: '' });
  const [answers, setAnswers] = useState([]); // [{question, answer}]
  const [file, setFile] = useState(null);
  const [enterDetailsManually, setEnterDetailsManually] = useState(false);
  const [manualStep, setManualStep] = useState(1);
  const [manualResume, setManualResume] = useState({
    education: [{ school: '', degree: '', year: '' }],
    experience: [{ company: '', title: '', duration: '', desc: '' }],
    skills: '',
    projects: [{ name: '', desc: '' }]
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // success message

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState({}); // { questionId: index|string }
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [quizLocked, setQuizLocked] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const startedRef = useRef(null);
  const hasQuiz = job?.quiz?.questions?.length > 0;

  const steps = [
    { id: 1, label: '01 PROFILE' },
    { id: 2, label: '02 DOCUMENTS' },
  ];
  if (hasQuiz) {
    steps.push({ id: 3, label: '03 QUIZ' });
  }

  useEffect(() => {
    api.get(`/public/jobs/${id}`)
      .then((res) => {
        if (res.data.success) {
          const j = res.data.data;
          setJob(j);
          setAnswers((j.screeningQuestions || []).map((q) => ({ question: q, answer: '' })));
          if (j.quiz?.questions?.length) {
            startedRef.current = Date.now();
            if (j.quiz.timeLimitMinutes) setSecondsLeft(j.quiz.timeLimitMinutes * 60);
          }
        } else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // For a logged-in applicant: detect a prior application to THIS role, and
  // whether they have a reusable primary résumé on file.
  useEffect(() => {
    if (!applicant) { setAppliedAppId(null); setHasPrimaryResume(false); return; }
    portalApi.get('/applications')
      .then((res) => {
        if (res.data.success) {
          const found = res.data.data.find((a) => a.job?._id === id);
          setAppliedAppId(found ? found._id : null);
        }
      })
      .catch(() => { });
    portalApi.get('/me')
      .then((res) => {
        if (!res.data.success) { setHasPrimaryResume(false); return; }
        const me = res.data;
        setHasPrimaryResume(Boolean(me.resumeUrl));
        if (me.resumeUrl) setPrimaryResumeName('your saved résumé');
        // Prefill from the account so the application uses the applicant's OWN
        // identity by default (and their entered name is preserved server-side,
        // not replaced by whatever name the résumé carries).
        setForm((f) => ({
          ...f,
          name: f.name || me.name || '',
          email: f.email || me.email || '',
          phone: f.phone || me.phone || '',
          currentLocation: f.currentLocation || me.location || '',
        }));
      })
      .catch(() => { });
  }, [applicant, id]);

  // Countdown timer — locks the quiz (not the whole form) when it hits zero.
  useEffect(() => {
    if (secondsLeft == null || quizLocked || done) return undefined;
    if (secondsLeft <= 0) { setQuizLocked(true); return undefined; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, quizLocked, done]);

  // Light anti-cheat: count how many times the applicant leaves the tab mid-quiz.
  useEffect(() => {
    if (!hasQuiz || done) return undefined;
    const onHide = () => { if (document.visibilityState === 'hidden') setTabSwitches((n) => n + 1); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [hasQuiz, done]);

  // Sync manual resume details to File object
  useEffect(() => {
    if (enterDetailsManually) {
      let content = `=== RESUME DETAIL PROFILE (MANUAL ENTRY) ===\n\n`;
      content += `NAME: ${form.name || 'N/A'}\n`;
      content += `EMAIL: ${form.email || 'N/A'}\n`;
      content += `PHONE: ${form.phone || 'N/A'}\n`;
      content += `LOCATION: ${form.currentLocation || 'N/A'}\n`;
      content += `EXPECTED SALARY: ${form.salaryExpectation || 'N/A'}\n\n`;

      content += `--- EDUCATION ---\n`;
      if (manualResume.education.length > 0) {
        manualResume.education.forEach((edu, idx) => {
          if (edu.school || edu.degree) {
            content += `[Education #${idx + 1}]\n`;
            content += `  School: ${edu.school || 'N/A'}\n`;
            content += `  Degree: ${edu.degree || 'N/A'}\n`;
            content += `  Graduation Year: ${edu.year || 'N/A'}\n`;
          }
        });
      } else {
        content += `No education history provided.\n`;
      }
      content += `\n`;

      content += `--- EXPERIENCE ---\n`;
      if (manualResume.experience.length > 0) {
        manualResume.experience.forEach((exp, idx) => {
          if (exp.company || exp.title) {
            content += `[Experience #${idx + 1}]\n`;
            content += `  Company: ${exp.company || 'N/A'}\n`;
            content += `  Title: ${exp.title || 'N/A'}\n`;
            content += `  Duration: ${exp.duration || 'N/A'}\n`;
            content += `  Description: ${exp.desc || 'N/A'}\n`;
          }
        });
      } else {
        content += `No experience history provided.\n`;
      }
      content += `\n`;

      content += `--- PROJECTS ---\n`;
      if (manualResume.projects.length > 0) {
        manualResume.projects.forEach((proj, idx) => {
          if (proj.name) {
            content += `[Project #${idx + 1}]\n`;
            content += `  Project Name: ${proj.name || 'N/A'}\n`;
            content += `  Description: ${proj.desc || 'N/A'}\n`;
          }
        });
      } else {
        content += `No projects provided.\n`;
      }
      content += `\n`;

      content += `--- KEY SKILLS ---\n`;
      content += `${manualResume.skills || 'No skills provided.'}\n`;

      const blob = new Blob([content], { type: 'text/plain' });
      const mockFile = new File([blob], `${(form.name || 'resume').replace(/\s+/g, '_')}_Resume_Manual.txt`, { type: 'text/plain' });
      setFile(mockFile);
    } else {
      if (file && file.name.endsWith('_Resume_Manual.txt')) {
        setFile(null);
      }
    }
  }, [enterDetailsManually, manualResume, form.name, form.email, form.phone, form.currentLocation, form.salaryExpectation]);

  const addEducation = () => {
    setManualResume((prev) => ({
      ...prev,
      education: [...prev.education, { school: '', degree: '', year: '' }]
    }));
  };
  const removeEducation = (index) => {
    setManualResume((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index)
    }));
  };
  const updateEducation = (index, field, value) => {
    const updated = [...manualResume.education];
    updated[index][field] = value;
    setManualResume((prev) => ({ ...prev, education: updated }));
  };

  const addExperience = () => {
    setManualResume((prev) => ({
      ...prev,
      experience: [...prev.experience, { company: '', title: '', duration: '', desc: '' }]
    }));
  };
  const removeExperience = (index) => {
    setManualResume((prev) => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index)
    }));
  };
  const updateExperience = (index, field, value) => {
    const updated = [...manualResume.experience];
    updated[index][field] = value;
    setManualResume((prev) => ({ ...prev, experience: updated }));
  };

  const addProject = () => {
    setManualResume((prev) => ({
      ...prev,
      projects: [...prev.projects, { name: '', desc: '' }]
    }));
  };
  const removeProject = (index) => {
    setManualResume((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index)
    }));
  };
  const updateProject = (index, field, value) => {
    const updated = [...manualResume.projects];
    updated[index][field] = value;
    setManualResume((prev) => ({ ...prev, projects: updated }));
  };

  // Phone is optional, but if provided it must be a valid number for its country.
  const phoneValid = !form.phone || isValidPhoneNumber(form.phone);

  const canGoNext = () => {
    if (currentStep === 1) {
      return form.name.trim() !== '' && form.email.trim() !== '' && form.email.includes('@') && phoneValid;
    }
    if (currentStep === 2) {
      if (enterDetailsManually) {
        return manualStep === 4 && manualResume.skills.trim() !== '';
      }
      return file !== null || (usePrimaryResume && hasPrimaryResume);
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email) { setError('Please provide your name and email.'); return; }
    if (form.phone && !isValidPhoneNumber(form.phone)) { setError('Please enter a valid phone number.'); return; }
    const reuseSaved = usePrimaryResume && hasPrimaryResume && !file;
    if (!enterDetailsManually && !file && !reuseSaved) { setError('Please attach your résumé.'); return; }

    // The screening ("Additional Screening") section is optional. The QUIZ,
    // however, must be fully answered — unless its timer already ran out. Point
    // the applicant at the exact blank question and jump to the quiz step.
    if (hasQuiz && !quizLocked) {
      const blankQuiz = job.quiz.questions.findIndex((q) => {
        const v = quizAnswers[q.id];
        return v === undefined || v === null || (typeof v === 'string' && !v.trim());
      });
      if (blankQuiz !== -1) {
        setCurrentStep(3);
        setError(`Please answer all quiz questions — question ${blankQuiz + 1} is unanswered.`);
        return;
      }
    }

    const fd = new FormData();
    if (enterDetailsManually) {
      // No résumé — send the structured details for the backend to store directly.
      fd.append('manualDetails', JSON.stringify(manualResume));
    } else {
      if (file) fd.append('resume', file);
      if (reuseSaved) fd.append('usePrimaryResume', 'true');
    }
    fd.append('jobId', id);
    fd.append('name', form.name);
    fd.append('email', form.email);
    fd.append('phone', form.phone);
    fd.append('currentLocation', form.currentLocation);
    fd.append('salaryExpectation', form.salaryExpectation);
    fd.append('screeningAnswers', JSON.stringify(answers.filter((a) => a.answer.trim())));

    if (hasQuiz) {
      const qa = Object.entries(quizAnswers).map(([questionId, answer]) => ({ questionId, answer }));
      fd.append('quizAnswers', JSON.stringify(qa));
      const spent = startedRef.current ? Math.round((Date.now() - startedRef.current) / 1000) : null;
      fd.append('quizTimeSpent', String(spent ?? ''));
      fd.append('quizTabSwitches', String(tabSwitches));
    }

    setSubmitting(true);
    try {
      // Attach the applicant token (if signed in) so the server can link the
      // application to the account and honor "use my saved résumé".
      const headers = { 'Content-Type': 'multipart/form-data' };
      const at = localStorage.getItem('applicant_token');
      if (at) headers.Authorization = `Bearer ${at}`;
      const res = await api.post('/public/apply', fd, { headers });
      if (res.data.success) setDone(res.data.message);
      else setError(res.data.message || 'Could not submit your application.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Reject oversized résumés in the browser BEFORE uploading (saves bandwidth
  // and keeps big files off the server). The server still enforces its own limit.
  const onPickResume = (f) => {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_RESUME_BYTES) {
      setError(`Résumé is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Please upload a file under 10 MB.`);
      return;
    }
    setError('');
    setFile(f);
  };

  const input = 'w-full h-11 px-4 border text-xs tracking-wide luxury-input focus:outline-none';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-gradient">
        <Loader2 size={30} className="animate-spin text-[#c5a880]" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-luxury-gradient p-6 text-center font-luxury">
        <AlertCircle className="text-[#c5a880] mb-4" size={36} />
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#1c1c1c] dark:text-[#f5efe9]">This position is no longer open.</h3>
        <Link to="/careers" className="text-xs text-[#c5a880] mt-4 hover:underline flex items-center tracking-widest uppercase"><ChevronLeft size={14} className="mr-1" /> Back to all positions</Link>
      </div>
    );
  }

  const previewLength = Math.max(150, Math.floor(job.description.length * 0.25));
  const descriptionPreview = job.description.slice(0, previewLength);
  const hasMoreDescription = job.description.length > previewLength;

  return (
    <div className="min-h-screen bg-luxury-gradient text-[#1c1c1c] dark:text-[#f5efe9] font-luxury flex flex-col justify-between">
      <div>
        {/* Brand Header */}
        <header className="border-b luxury-border-thin bg-white/40 dark:bg-black/20 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
            <Link to="/careers" className="flex items-center space-x-3">
              <img
                src="https://parakkatjewels.com/cdn/shop/files/Logo.png?v=1711363419&width=96"
                alt="Parakkat Jewels Logo"
                className="h-10 w-auto object-contain brightness-100 dark:brightness-95 dark:contrast-125"
              />
              <span className="font-luxury font-medium tracking-[0.2em] text-xs uppercase hidden sm:inline-block border-l luxury-border-thin pl-3 text-[#1c1c1c] dark:text-[#e2d1c5]">
                Careers
              </span>
            </Link>
            <div className="flex items-center space-x-3.5">
              <Link to="/portal/dashboard" className="text-[9px] tracking-[0.15em] text-[#c5a880] hover:text-[#1c1c1c] dark:hover:text-white uppercase font-semibold transition-colors duration-200 hidden sm:inline-block">
                My Applications
              </Link>
              <span className="text-slate-200 dark:text-slate-800 hidden sm:inline-block">|</span>
              <Link to="/login" className="text-[9px] tracking-[0.15em] text-[#c5a880] hover:text-[#c5a880] uppercase font-semibold transition-colors duration-200">
                Login
              </Link>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="max-w-5xl mx-auto px-5 py-5">
          {/* <Link to="/careers" className="inline-flex items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-[#c5a880] mb-4 transition-colors duration-200">
            <ChevronLeft size={14} className="mr-1 text-[#c5a880]" /> All positions
          </Link> */}

          {!showForm ? (
            /* 1. Spacious Central Role Description View */
            <div className="max-w-5xl mx-auto bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin rounded-none shadow-sm overflow-hidden w-full animate-fadeIn">
              {/* Header Banner */}
              <div className="bg-[#1c1c1c] text-white p-6 border-b-2 luxury-border-gold">
                <span className="text-[9px] font-bold text-[#c5a880] uppercase tracking-[0.25em]">{job.department}</span>
                <h1 className="text-xl sm:text-2xl font-light uppercase tracking-widest text-white mt-3 leading-tight">
                  {job.title}
                </h1>
                <div className="w-12 h-[1px] bg-[#c5a880] my-4"></div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] tracking-widest uppercase text-[#e2d1c5]">
                  <span className="flex items-center gap-1.5"><MapPin size={11} className="text-[#c5a880]" /> {job.location}</span>
                  <span className="flex items-center gap-1.5"><Clock size={11} className="text-[#c5a880]" /> {job.employmentType}</span>
                  {job.experience && <span className="flex items-center gap-1.5"><Briefcase size={11} className="text-[#c5a880]" /> {job.experience}</span>}
                  {job.salaryRange && <span className="flex items-center gap-1.5 font-semibold text-[#c5a880]">{job.salaryRange}</span>}
                </div>
              </div>

              {/* Body Content */}
              <div className="p-6 space-y-6">
                {/* Desktop View: Flat list */}
                <div className="hidden lg:block space-y-6">
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1c1c1c] dark:text-[#f5efe9] border-b luxury-border-thin pb-2 mb-4">
                      Role Description
                    </h3>
                    <p className="text-[14px] text-black dark:text-slate-400 leading-loose tracking-wide font-light">
                      <RichText text={job.description} />
                    </p>
                  </div>

                  {job.requiredSkills?.length > 0 && (
                    <div className="pt-6 border-t luxury-border-thin">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] block mb-3">
                        Required Skills
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {job.requiredSkills.map((s, i) => (
                          <span key={i} className="text-[9px] font-medium uppercase tracking-wider px-3 py-1 bg-[#c5a880]/10 text-[#c5a880] border border-[#c5a880]/20 rounded-none">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile View: Accordions */}
                <div className="lg:hidden space-y-4 w-full">
                  {/* Description Read More */}
                  <div className="border luxury-border-thin p-4">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] block mb-3">Role Description</span>
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-loose tracking-wide font-light">
                      <RichText text={descExpanded ? job.description : `${descriptionPreview}...`} />
                    </p>
                    {hasMoreDescription && (
                      <button
                        type="button"
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="text-[9px] font-bold text-[#c5a880] uppercase tracking-widest mt-3 hover:underline inline-flex items-center gap-1 focus:outline-none"
                      >
                        {descExpanded ? 'Show Less' : 'Read Full Description'}
                        <ChevronDown size={11} className={`transform transition-transform ${descExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Skills Accordion */}
                  {job.requiredSkills?.length > 0 && (
                    <div className="border luxury-border-thin">
                      <button
                        type="button"
                        onClick={() => setSkillsExpanded(!skillsExpanded)}
                        className="w-full flex items-center justify-between p-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#1c1c1c] dark:text-[#f5efe9] bg-slate-50 dark:bg-black/20"
                      >
                        <span>Required Skills</span>
                        <ChevronDown size={14} className={`transform transition-transform duration-200 ${skillsExpanded ? 'rotate-180 text-[#c5a880]' : 'text-slate-400'}`} />
                      </button>
                      {skillsExpanded && (
                        <div className="p-4 border-t luxury-border-thin flex flex-wrap gap-2 animate-fadeIn">
                          {job.requiredSkills.map((s, i) => (
                            <span key={i} className="text-[9px] font-medium uppercase tracking-wider px-3 py-1 bg-[#c5a880]/10 text-[#c5a880] border border-[#c5a880]/20 rounded-none">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Apply Button CTA — or an "already applied" notice */}
                <div className="pt-6 border-t luxury-border-thin flex justify-center">
                  {appliedAppId ? (
                    <div className="text-center space-y-3">
                      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em]">
                        You have already applied for this position
                      </p>
                      <Link
                        to={`/portal/applications/${appliedAppId}`}
                        className="px-10 h-12 luxury-button-primary hover:bg-[#c5a880] transition duration-300 rounded-none cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span className="text-xs sm:text-sm">VIEW YOUR APPLICATION</span>
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowForm(true)}
                      className="px-10 h-12 luxury-button-primary hover:bg-[#c5a880] transition duration-300 rounded-none cursor-pointer flex items-center gap-2"
                    >
                      <span className="text-xs sm:text-sm">APPLY FOR THIS ROLE</span>
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* 2. Spacious Split-Screen Interactive Apply Layout */
            /* 2. Spacious Centered Application Form Wizard (Job details hidden) */
            <div className="w-full max-w-2xl mx-auto">
              {done ? (
                <div className="bg-white/80 dark:bg-[#151210]/80 border border-emerald-500/20 rounded-none p-6 text-center shadow-sm">
                  <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={36} />
                  <h3 className="text-base font-semibold uppercase tracking-wider text-[#1c1c1c] dark:text-[#f5efe9]">
                    Application received
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto tracking-wide leading-relaxed">
                    {done}
                  </p>
                  <Link to="/careers" className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[#c5a880] mt-6 hover:underline">
                    Browse more positions
                  </Link>
                </div>
              ) : (
                <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin rounded-none p-6 shadow-sm">
                  {/* Wizard Header Progress Bar */}
                  <div className="flex items-center justify-between border-b luxury-border-thin pb-4 mb-6">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#1c1c1c] dark:text-[#f5efe9]">
                      Apply for this role
                    </h3>

                    {/* Step indicators */}
                    <div className="flex items-center gap-3 md:gap-5 text-[9px] font-bold tracking-widest text-slate-400">
                      {steps.map((step, idx) => (
                        <React.Fragment key={step.id}>
                          {idx > 0 && <span className="text-slate-300 dark:text-slate-800">|</span>}
                          <span className={currentStep === step.id ? 'text-[#c5a880]' : currentStep > step.id ? 'text-[#1c1c1c] dark:text-[#f5efe9] line-through' : ''}>
                            {step.label}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="p-3.5 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-none flex items-center tracking-wide">
                      <AlertCircle size={15} className="mr-2" />{error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Step 1: Personal Details */}
                    {currentStep === 1 && (
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Full Name *</label>
                            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="JANE DOE" className={input} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email Address *</label>
                            <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="JANE@EMAIL.COM" className={input} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Phone Number</label>
                            <PhoneInput
                              defaultCountry="IN"
                              value={form.phone || undefined}
                              onChange={(v) => setForm((f) => ({ ...f, phone: v || '' }))}
                              className={`luxury-phone ${form.phone && !phoneValid ? 'luxury-phone-error' : ''}`}
                              placeholder="90000 00000"
                            />
                            {form.phone && !phoneValid && (
                              <span className="text-[9px] text-rose-500 uppercase tracking-widest">Enter a valid phone number</span>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Current Location</label>
                            <LocationSearchInput
                              value={form.currentLocation}
                              onChange={(val) => setForm((f) => ({ ...f, currentLocation: val }))}
                              placeholder="KOCHI, KERALA"
                              className={input}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Salary Expectation</label>
                            <input value={form.salaryExpectation} onChange={(e) => setForm((f) => ({ ...f, salaryExpectation: e.target.value }))} placeholder="e.g. ₹30,000 / month or Negotiable" className={input} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Resume & Screening */}
                    {currentStep === 2 && (
                      <div className="space-y-5">
                        {/* Résumé upload */}
                        <div className="space-y-2">
                          <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Résumé Attachment *</label>

                          {/* Logged-in applicant with a saved résumé can reuse it */}
                          {hasPrimaryResume && (
                            <label className="flex items-center gap-2.5 p-3 border luxury-border-thin cursor-pointer text-xs tracking-wide bg-[#c5a880]/5">
                              <input type="checkbox" checked={usePrimaryResume} onChange={(e) => setUsePrimaryResume(e.target.checked)} className="accent-[#c5a880]" />
                              <span className="text-slate-600 dark:text-slate-300">Use {primaryResumeName || 'my saved résumé'}</span>
                            </label>
                          )}

                          {/* Checkbox to enter details manually */}
                          <label className="flex items-center gap-2.5 p-3 border luxury-border-thin cursor-pointer text-xs tracking-wide bg-[#c5a880]/5">
                            <input type="checkbox" checked={enterDetailsManually} onChange={(e) => {
                              setEnterDetailsManually(e.target.checked);
                              if (e.target.checked) setUsePrimaryResume(false);
                            }} className="accent-[#c5a880]" />
                            <span className="text-slate-600 dark:text-slate-300 font-semibold">I don't have a résumé, I'll enter my details manually</span>
                          </label>

                          {(!hasPrimaryResume || !usePrimaryResume) && !enterDetailsManually && (
                            <label className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-none cursor-pointer transition-all duration-300 ${file ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-300 dark:border-slate-800 hover:border-[#c5a880]'}`}>
                              {file ? <FileText size={24} className="text-emerald-500 mb-2" /> : <UploadCloud size={24} className="text-[#c5a880] mb-2" />}
                              <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-full font-medium tracking-wide">
                                {file ? file.name : (hasPrimaryResume ? 'UPLOAD A DIFFERENT RÉSUMÉ' : 'ATTACH YOUR RÉSUMÉ')}
                              </span>
                              <span className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">
                                PDF, DOC, DOCX, TXT, RTF, IMAGE (MAX 10MB)
                              </span>
                              <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => onPickResume(e.target.files?.[0] || null)} />
                            </label>
                          )}

                          {enterDetailsManually && (
                            <div className="p-3 border luxury-border-thin bg-slate-50/30 dark:bg-black/10 space-y-4 mt-3 animate-in fade-in duration-300">
                              {/* Horizontal sub-step indicator */}
                              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2 mb-3">
                                <span className="text-[10px] font-bold text-[#c5a880] uppercase tracking-[0.25em]">Manual Résumé Builder</span>
                                <div className="flex items-center gap-1.5 sm:gap-2.5 text-[8.5px] font-bold tracking-wider text-slate-400">
                                  <span className={manualStep === 1 ? 'text-[#c5a880]' : manualStep > 1 ? 'text-[#c5a880]/60' : ''}>01 EDU</span>
                                  <span className="text-slate-355 dark:text-slate-800">➔</span>
                                  <span className={manualStep === 2 ? 'text-[#c5a880]' : manualStep > 2 ? 'text-[#c5a880]/60' : ''}>02 EXP</span>
                                  <span className="text-slate-355 dark:text-slate-800">➔</span>
                                  <span className={manualStep === 3 ? 'text-[#c5a880]' : manualStep > 3 ? 'text-[#c5a880]/60' : ''}>03 PROJ</span>
                                  <span className="text-slate-355 dark:text-slate-800">➔</span>
                                  <span className={manualStep === 4 ? 'text-[#c5a880]' : ''}>04 SKILLS</span>
                                </div>
                              </div>

                              {/* Node 1: Education */}
                              {manualStep === 1 && (
                                <div className="space-y-3 animate-in fade-in duration-200">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-extrabold text-[#c5a880] uppercase tracking-wider">Education</span>
                                    <button type="button" onClick={addEducation} className="text-[9px] font-bold text-[#c5a880] hover:underline uppercase tracking-wider">
                                      + Add School
                                    </button>
                                  </div>
                                  {manualResume.education.map((edu, idx) => (
                                    <div key={idx} className="p-2 border luxury-border-thin bg-white/30 dark:bg-black/20 space-y-2 relative">
                                      {manualResume.education.length > 1 && (
                                        <button type="button" onClick={() => removeEducation(idx)} className="absolute right-3 top-2.5 text-[9px] font-bold text-rose-500 hover:underline uppercase tracking-wider">
                                          Remove
                                        </button>
                                      )}
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">School/University</label>
                                          <input type="text" value={edu.school} onChange={(e) => updateEducation(idx, 'school', e.target.value)} placeholder="e.g. University of Kerala" className={input} />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Degree/Major</label>
                                          <input type="text" value={edu.degree} onChange={(e) => updateEducation(idx, 'degree', e.target.value)} placeholder="e.g. B.Tech Computer Science" className={input} />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Graduation Year</label>
                                          <input type="text" value={edu.year} onChange={(e) => updateEducation(idx, 'year', e.target.value)} placeholder="e.g. 2024" className={input} />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Node 2: Work Experience */}
                              {manualStep === 2 && (
                                <div className="space-y-3 animate-in fade-in duration-200">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-extrabold text-[#c5a880] uppercase tracking-wider">Work Experience</span>
                                    <button type="button" onClick={addExperience} className="text-[9px] font-bold text-[#c5a880] hover:underline uppercase tracking-wider">
                                      + Add Experience
                                    </button>
                                  </div>
                                  {manualResume.experience.map((exp, idx) => (
                                    <div key={idx} className="p-2 border luxury-border-thin bg-white/30 dark:bg-black/20 space-y-2 relative">
                                      {manualResume.experience.length > 1 && (
                                        <button type="button" onClick={() => removeExperience(idx)} className="absolute right-3 top-2.5 text-[9px] font-bold text-rose-500 hover:underline uppercase tracking-wider">
                                          Remove
                                        </button>
                                      )}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Company Name</label>
                                          <input type="text" value={exp.company} onChange={(e) => updateExperience(idx, 'company', e.target.value)} placeholder="e.g. TCS" className={input} />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Job Title</label>
                                          <input type="text" value={exp.title} onChange={(e) => updateExperience(idx, 'title', e.target.value)} placeholder="e.g. Frontend Engineer" className={input} />
                                        </div>
                                        <div className="space-y-1 sm:col-span-2">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Duration / Date Range</label>
                                          <input type="text" value={exp.duration} onChange={(e) => updateExperience(idx, 'duration', e.target.value)} placeholder="e.g. June 2022 - Present or 2 Years" className={input} />
                                        </div>
                                        <div className="space-y-1 sm:col-span-2">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Role Summary / Key Achievements</label>
                                          <textarea rows="3" value={exp.desc} onChange={(e) => updateExperience(idx, 'desc', e.target.value)} placeholder="Describe your key responsibilities and impact..." className="w-full p-2.5 border text-xs tracking-wide luxury-input focus:outline-none resize-none bg-transparent" />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Node 3: Projects */}
                              {manualStep === 3 && (
                                <div className="space-y-3 animate-in fade-in duration-200">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-extrabold text-[#c5a880] uppercase tracking-wider">Projects (Optional)</span>
                                    <button type="button" onClick={addProject} className="text-[9px] font-bold text-[#c5a880] hover:underline uppercase tracking-wider">
                                      + Add Project
                                    </button>
                                  </div>
                                  {manualResume.projects.map((proj, idx) => (
                                    <div key={idx} className="p-2 border luxury-border-thin bg-white/30 dark:bg-black/20 space-y-2 relative">
                                      {manualResume.projects.length > 1 && (
                                        <button type="button" onClick={() => removeProject(idx)} className="absolute right-3 top-2.5 text-[9px] font-bold text-rose-500 hover:underline uppercase tracking-wider">
                                          Remove
                                        </button>
                                      )}
                                      <div className="space-y-2">
                                        <div className="space-y-1">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Project Name</label>
                                          <input type="text" value={proj.name} onChange={(e) => updateProject(idx, 'name', e.target.value)} placeholder="e.g. Portfolio Website" className={input} />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Project Description</label>
                                          <textarea rows="2" value={proj.desc} onChange={(e) => updateProject(idx, 'desc', e.target.value)} placeholder="Briefly describe the technologies used and goals of this project..." className="w-full p-2.5 border text-xs tracking-wide luxury-input focus:outline-none resize-none bg-transparent" />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Node 4: Skills */}
                              {manualStep === 4 && (
                                <div className="space-y-3 animate-in fade-in duration-200">
                                  <span className="text-[9px] font-extrabold text-[#c5a880] uppercase tracking-wider block">Key Professional Skills *</span>
                                  <div className="space-y-1.5">
                                    <input type="text" required={enterDetailsManually} value={manualResume.skills} onChange={(e) => setManualResume((prev) => ({ ...prev, skills: e.target.value }))} placeholder="e.g. React, JavaScript, Node.js, UI/UX Design, CSS" className={input} />
                                    <p className="text-[8px] text-slate-400 uppercase tracking-wider">Separate skills with commas.</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Screening questions */}
                        {answers.length > 0 && (
                          <div className="space-y-4 pt-4 border-t luxury-border-thin">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Additional Screening</span>
                            {answers.map((a, idx) => (
                              <div key={idx} className="space-y-2">
                                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{a.question}</label>
                                <textarea
                                  rows="3"
                                  value={a.answer}
                                  onChange={(e) => setAnswers((prev) => prev.map((x, i) => (i === idx ? { ...x, answer: e.target.value } : x)))}
                                  className="w-full p-4 border text-xs tracking-wide luxury-input focus:outline-none resize-y"
                                  placeholder="Type your response here..."
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step 3: Screening Quiz */}
                    {currentStep === 3 && hasQuiz && (
                      <div className="space-y-5">
                        <div className="flex items-center justify-between border-b luxury-border-thin pb-3">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center">
                            <ClipboardList size={13} className="mr-1.5 text-[#c5a880]" /> Screening Quiz
                          </span>
                          {secondsLeft != null && (
                            <span className={`flex items-center gap-1 text-[9px] font-bold px-2.5 py-0.5 rounded-none border ${secondsLeft <= 30 ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 luxury-border-thin'}`}>
                              <Clock size={11} /> {quizLocked ? "TIME'S UP" : fmtTime(secondsLeft)}
                            </span>
                          )}
                        </div>
                        {quizLocked && (
                          <div className="p-3 text-[10px] rounded-none bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center gap-2 uppercase tracking-wide">
                            <AlertTriangle size={14} /> Time is up — your current answers are locked. Submit to finish.
                          </div>
                        )}
                        {job.quiz.questions.map((q, qi) => (
                          <div key={q.id} className="space-y-2">
                            <label className="text-xs font-medium text-[#1c1c1c] dark:text-[#f5efe9]">{qi + 1}. {q.question}</label>
                            {q.type === 'mcq' ? (
                              <div className="space-y-2">
                                {(q.options || []).map((opt, oi) => (
                                  <label key={oi} className={`flex items-center gap-2.5 p-3 rounded-none border cursor-pointer text-xs tracking-wide transition-all ${quizAnswers[q.id] === oi ? 'border-[#c5a880] bg-[#c5a880]/5 text-[#1c1c1c] dark:text-[#e2d1c5]' : 'border-slate-200 dark:border-slate-800 hover:border-[#c5a880]'} ${quizLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                    <input
                                      type="radio" name={`quiz-${q.id}`} checked={quizAnswers[q.id] === oi} disabled={quizLocked}
                                      onChange={() => setQuizAnswers((p) => ({ ...p, [q.id]: oi }))}
                                      className="accent-[#c5a880]"
                                    />
                                    <span className="text-slate-700 dark:text-slate-300">{opt}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <textarea
                                rows="3" disabled={quizLocked}
                                value={quizAnswers[q.id] || ''}
                                onChange={(e) => setQuizAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                                className="w-full p-4 border text-xs tracking-wide luxury-input focus:outline-none resize-y disabled:opacity-60"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Navigation buttons */}
                    {currentStep === 2 && enterDetailsManually ? (
                      <div className="flex items-center justify-between pt-4 border-t luxury-border-thin">
                        <button
                          type="button"
                          onClick={() => {
                            if (manualStep > 1) {
                              setManualStep((s) => s - 1);
                            } else {
                              setCurrentStep(1);
                            }
                          }}
                          className="px-6 h-11 border border-slate-300 dark:border-slate-800 text-[10px] font-medium tracking-widest uppercase rounded-none hover:border-[#c5a880] transition duration-300 cursor-pointer text-[#1c1c1c] dark:text-[#f5efe9]"
                        >
                          Back
                        </button>

                        {manualStep < 4 ? (
                          <button
                            type="button"
                            onClick={() => setManualStep((s) => s + 1)}
                            className="px-8 h-11 bg-[#1c1c1c] text-white hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer"
                          >
                            Next
                          </button>
                        ) : currentStep < steps.length ? (
                          <button
                            type="button"
                            disabled={!manualResume.skills.trim()}
                            onClick={() => setCurrentStep((s) => s + 1)}
                            className="px-8 h-11 bg-[#1c1c1c] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer"
                          >
                            Next
                          </button>
                        ) : (
                          <button
                            type="submit"
                            disabled={submitting || !manualResume.skills.trim()}
                            className="flex items-center justify-center px-8 h-11 bg-[#1c1c1c] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer"
                          >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <span>Submit Application</span>}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-4 border-t luxury-border-thin">
                        {currentStep > 1 ? (
                          <button
                            type="button"
                            onClick={() => setCurrentStep((s) => s - 1)}
                            className="px-6 h-11 border border-slate-300 dark:border-slate-800 text-[10px] font-medium tracking-widest uppercase rounded-none hover:border-[#c5a880] transition duration-300 cursor-pointer text-[#1c1c1c] dark:text-[#f5efe9]"
                          >
                            Back
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="px-6 h-11 border border-slate-300 dark:border-slate-800 text-[10px] font-medium tracking-widest uppercase rounded-none hover:border-[#c5a880] transition duration-300 cursor-pointer text-[#1c1c1c] dark:text-[#f5efe9]"
                          >
                            Cancel
                          </button>
                        )}

                        {currentStep < steps.length ? (
                          <button
                            type="button"
                            disabled={!canGoNext()}
                            onClick={() => setCurrentStep((s) => s + 1)}
                            className="px-8 h-11 bg-[#1c1c1c] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer"
                          >
                            Next
                          </button>
                        ) : (
                          <button
                            type="submit"
                            disabled={submitting || (currentStep === 2 && !canGoNext())}
                            className="flex items-center justify-center px-8 h-11 bg-[#1c1c1c] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer"
                          >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <span>Submit Application</span>}
                          </button>
                        )}
                      </div>
                    )}

                    <p className="text-[8px] text-slate-400 uppercase tracking-widest text-center leading-relaxed mt-4">
                      By applying, you consent to your résumé being processed for this role in accordance with our privacy guidelines.
                    </p>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Brand Footer */}
      <footer className="text-center text-[9px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-600 border-t luxury-border-thin py-10 max-w-5xl mx-auto w-full">
        &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
      </footer>
    </div>
  );
};

export default CareerApply;
