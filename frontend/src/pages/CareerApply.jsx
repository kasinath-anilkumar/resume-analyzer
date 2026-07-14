import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  Briefcase, MapPin, Clock, ChevronLeft, Loader2, UploadCloud,
  CheckCircle2, AlertCircle, FileText, ClipboardList, AlertTriangle
} from 'lucide-react';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const ACCEPT = '.pdf,.doc,.docx,.txt,.rtf,image/*';

const CareerApply = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [answers, setAnswers] = useState([]); // [{question, answer}]
  const [file, setFile] = useState(null);
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

  const canGoNext = () => {
    if (currentStep === 1) {
      return form.name.trim() !== '' && form.email.trim() !== '' && form.email.includes('@');
    }
    if (currentStep === 2) {
      return file !== null;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email) { setError('Please provide your name and email.'); return; }
    if (!file) { setError('Please attach your résumé.'); return; }

    const fd = new FormData();
    fd.append('resume', file);
    fd.append('jobId', id);
    fd.append('name', form.name);
    fd.append('email', form.email);
    fd.append('phone', form.phone);
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
      const res = await api.post('/public/apply', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success) setDone(res.data.message);
      else setError(res.data.message || 'Could not submit your application.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div className="min-h-screen bg-luxury-gradient text-[#1c1c1c] dark:text-[#f5efe9] font-luxury flex flex-col justify-between">
      <div>
        {/* Brand Header */}
        <header className="border-b luxury-border-thin bg-white/40 dark:bg-black/20 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
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
            <span className="text-[9px] tracking-[0.15em] text-[#c5a880] uppercase font-semibold">
              Layered with Pure Gold
            </span>
          </div>
        </header>

        {/* Content Area */}
        <div className="max-w-7xl mx-auto px-5 py-10">
          <Link to="/careers" className="inline-flex items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-[#c5a880] mb-6 transition-colors duration-200">
            <ChevronLeft size={14} className="mr-1 text-[#c5a880]" /> All positions
          </Link>

          <div className="flex flex-col lg:flex-row gap-10 items-start">
            {/* Left Panel: Job Specs (Sticky on desktop) */}
            <div className="w-full lg:w-[45%] lg:sticky lg:top-24">
              <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin rounded-none shadow-sm overflow-hidden w-full">
                {/* Header Banner */}
                <div className="bg-[#1c1c1c] text-white p-8 border-b-2 luxury-border-gold">
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
                <div className="p-8 space-y-6">
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1c1c1c] dark:text-[#f5efe9] border-b luxury-border-thin pb-2 mb-4">
                      Role Description
                    </h3>
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-loose tracking-wide whitespace-pre-line font-light">
                      {job.description}
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
              </div>
            </div>

            {/* Right Panel: Application Form Wizard */}
            <div className="w-full lg:w-[55%]">
              {done ? (
                <div className="bg-white/80 dark:bg-[#151210]/80 border border-emerald-500/20 rounded-none p-8 text-center shadow-sm">
                  <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={36} />
                  <h3 className="text-base font-semibold uppercase tracking-wider text-[#1c1c1c] dark:text-[#f5efe9]">
                    Application received
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto tracking-wide leading-relaxed">
                    {done}
                  </p>
                  <div className="mt-6 pt-6 border-t luxury-border-thin max-w-sm mx-auto">
                    <p className="text-[10px] tracking-widest uppercase text-slate-400 mb-3">Want to follow your application?</p>
                    <Link
                      to={`/portal/register?email=${encodeURIComponent(form.email)}`}
                      className="inline-flex items-center justify-center gap-2 px-6 h-11 bg-[#1c1c1c] text-white hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase transition duration-300"
                    >
                      Create an account to track it
                    </Link>
                    <Link to="/careers" className="block text-[10px] font-semibold uppercase tracking-widest text-[#c5a880] mt-4 hover:underline">
                      Browse more positions
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin rounded-none p-8 shadow-sm">
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
                          <div className="space-y-2 sm:col-span-2">
                            <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Phone Number</label>
                            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 1234" className={input} />
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
                          <label className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-none cursor-pointer transition-all duration-300 ${file ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-300 dark:border-slate-800 hover:border-[#c5a880]'}`}>
                            {file ? <FileText size={24} className="text-emerald-500 mb-2" /> : <UploadCloud size={24} className="text-[#c5a880] mb-2" />}
                            <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-full font-medium tracking-wide">
                              {file ? file.name : 'ATTACH YOUR RÉSUMÉ'}
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">
                              PDF, DOC, DOCX, TXT, RTF, IMAGE (MAX 10MB)
                            </span>
                            <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                          </label>
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
                        <div></div>
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

                    <p className="text-[8px] text-slate-400 uppercase tracking-widest text-center leading-relaxed mt-4">
                      By applying, you consent to your résumé being processed for this role in accordance with our privacy guidelines.
                    </p>
                  </form>
                </div>
              )}
            </div>
          </div>
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
