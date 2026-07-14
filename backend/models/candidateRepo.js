const { getClient } = require('../config/supabase');

const TABLE = 'candidates';

const toApi = (row) =>
  row && {
    _id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    resumeUrl: row.resume_url,
    skills: row.skills || [],
    education: row.education || [],
    experience: row.experience || [],
    projects: row.projects || [],
    certifications: row.certifications || [],
    languages: row.languages || [],
    githubUrl: row.github_url || '',
    linkedInUrl: row.linkedin_url || '',
    portfolioUrl: row.portfolio_url || '',
    notes: row.notes || [],
    interviews: row.interviews || [],
    status: row.status,
    source: row.source || 'Manual',
    currentLocation: row.current_location || '',
    salaryExpectation: row.salary_expectation || '',
    screeningAnswers: row.screening_answers || [],
    analysisStatus: row.analysis_status || 'completed',
    analysisError: row.analysis_error || '',
    quizResult: row.quiz_result && typeof row.quiz_result === 'object' ? row.quiz_result : {},
    consentAt: row.consent_at || null,
    deletedAt: row.deleted_at || null,
    jobId: row.job_id, // replaced with a populated object where noted
    aiAnalysis: row.ai_analysis || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

const toRow = (data = {}) => {
  const row = {};
  if (data.name !== undefined) row.name = data.name;
  if (data.email !== undefined) row.email = data.email;
  if (data.phone !== undefined) row.phone = data.phone;
  if (data.resumeUrl !== undefined) row.resume_url = data.resumeUrl;
  if (data.skills !== undefined) row.skills = data.skills || [];
  if (data.education !== undefined) row.education = data.education || [];
  if (data.experience !== undefined) row.experience = data.experience || [];
  if (data.projects !== undefined) row.projects = data.projects || [];
  if (data.certifications !== undefined) row.certifications = data.certifications || [];
  if (data.languages !== undefined) row.languages = data.languages || [];
  if (data.githubUrl !== undefined) row.github_url = data.githubUrl;
  if (data.linkedInUrl !== undefined) row.linkedin_url = data.linkedInUrl;
  if (data.portfolioUrl !== undefined) row.portfolio_url = data.portfolioUrl;
  if (data.notes !== undefined) row.notes = data.notes || [];
  if (data.interviews !== undefined) row.interviews = data.interviews || [];
  if (data.status !== undefined) row.status = data.status;
  if (data.source !== undefined) row.source = data.source;
  if (data.currentLocation !== undefined) row.current_location = data.currentLocation;
  if (data.salaryExpectation !== undefined) row.salary_expectation = data.salaryExpectation;
  if (data.screeningAnswers !== undefined) row.screening_answers = data.screeningAnswers || [];
  if (data.analysisStatus !== undefined) row.analysis_status = data.analysisStatus;
  if (data.analysisError !== undefined) row.analysis_error = data.analysisError;
  if (data.quizResult !== undefined) row.quiz_result = data.quizResult || {};
  if (data.consentAt !== undefined) row.consent_at = data.consentAt;
  if (data.applicantId !== undefined) row.applicant_id = data.applicantId;
  if (data.jobId !== undefined) row.job_id = data.jobId;
  if (data.aiAnalysis !== undefined) row.ai_analysis = data.aiAnalysis || {};
  return row;
};

// Fetch referenced jobs and return a { jobId: {_id, ...fields} } lookup.
const jobLookup = async (jobIds, fields) => {
  const ids = [...new Set(jobIds.filter(Boolean).map(String))];
  if (!ids.length) return {};
  const { data, error } = await getClient()
    .from('jobs')
    .select(`id, ${fields.join(', ')}`)
    .in('id', ids);
  if (error) throw error;
  const map = {};
  (data || []).forEach((j) => {
    map[j.id] = {
      _id: j.id,
      title: j.title,
      department: j.department,
      ...(fields.includes('required_skills') ? { requiredSkills: j.required_skills || [] } : {}),
      ...(fields.includes('preferred_skills') ? { preferredSkills: j.preferred_skills || [] } : {}),
      ...(fields.includes('description') ? { description: j.description } : {}),
      ...(fields.includes('location') ? { location: j.location } : {}),
      ...(fields.includes('employment_type') ? { employmentType: j.employment_type } : {}),
    };
  });
  return map;
};

const CandidateRepo = {
  toApi,

  async create(data) {
    const { data: created, error } = await getClient()
      .from(TABLE)
      .insert(toRow(data))
      .select('*')
      .single();
    if (error) throw error;
    return toApi(created);
  },

  // List with populated jobId ({_id,title,department}). jobId/status are pushed
  // to the DB; the fuzzier filters (minScore, skill, free-text search) are
  // applied in JS to reproduce the previous Mongo/regex behaviour exactly.
  async listApi({ jobId, status, minScore, skill, search } = {}) {
    let q = getClient().from(TABLE).select('*').is('deleted_at', null);
    if (jobId) q = q.eq('job_id', jobId);
    if (status) q = q.eq('status', status);
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;

    let rows = (data || []).map(toApi);

    if (minScore) {
      const min = parseInt(minScore, 10);
      rows = rows.filter((c) => (c.aiAnalysis?.overallScore || 0) >= min);
    }
    if (skill) {
      const s = String(skill).toLowerCase();
      rows = rows.filter((c) => (c.skills || []).some((k) => k.toLowerCase().includes(s)));
    }
    if (search) {
      const s = String(search).toLowerCase();
      rows = rows.filter((c) => {
        const inSkills = (c.skills || []).some((k) => k.toLowerCase().includes(s));
        const inExp = (c.experience || []).some(
          (e) =>
            String(e.company || '').toLowerCase().includes(s) ||
            String(e.title || '').toLowerCase().includes(s)
        );
        return (
          String(c.name || '').toLowerCase().includes(s) ||
          String(c.email || '').toLowerCase().includes(s) ||
          inSkills ||
          inExp
        );
      });
    }

    // Detect repeat applications by the same email across the WHOLE table.
    // A repeat for the SAME job is a true duplicate; a repeat on a DIFFERENT job
    // just means the person also applied elsewhere — surface THAT (with the
    // other job's title) rather than badging it as a duplicate.
    const { data: allApps } = await getClient().from(TABLE).select('id, email, job_id').is('deleted_at', null);
    const byEmail = {};
    (allApps || []).forEach((r) => {
      const e = String(r.email || '').toLowerCase();
      if (e) (byEmail[e] = byEmail[e] || []).push(r);
    });

    // Resolve titles for every job referenced by the rows AND by any other
    // application from the same emails, in a single lookup.
    const jobIdsNeeded = new Set(rows.map((c) => String(c.jobId)));
    rows.forEach((c) => {
      (byEmail[String(c.email || '').toLowerCase()] || []).forEach((r) => jobIdsNeeded.add(String(r.job_id)));
    });
    const jobs = await jobLookup([...jobIdsNeeded], ['title', 'department']);

    return rows.map((c) => {
      const group = byEmail[String(c.email || '').toLowerCase()] || [];
      const sameJob = group.filter(
        (r) => String(r.job_id) === String(c.jobId) && String(r.id) !== String(c._id)
      );
      // Distinct OTHER jobs this person also applied to.
      const otherJobIds = [...new Set(
        group.filter((r) => String(r.job_id) !== String(c.jobId)).map((r) => String(r.job_id))
      )];
      return {
        ...c,
        jobId: jobs[String(c.jobId)] || { _id: c.jobId, title: 'Unknown', department: 'Unknown' },
        isDuplicate: sameJob.length > 0, // same email, SAME job = real duplicate
        duplicateCount: sameJob.length + 1, // total records for this person on this job
        otherApplications: otherJobIds.map((jid) => ({ _id: jid, title: jobs[jid]?.title || 'Unknown role' })),
      };
    });
  },

  // Single candidate with a richer populated job object.
  async findByIdApi(id) {
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const c = toApi(data);
    const jobs = await jobLookup(
      [c.jobId],
      ['title', 'department', 'required_skills', 'preferred_skills', 'description']
    );
    c.jobId = jobs[String(c.jobId)] || c.jobId;
    return c;
  },

  // Raw row (unmapped) — used for note edits and resume-url lookups.
  async getRaw(id) {
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  },

  // --- Async analysis queue --------------------------------------------------
  // Atomically claim the oldest pending candidate for analysis. Returns the
  // claimed row (with resume_url + job_id) or null if the queue is empty. The
  // conditional update (…eq('analysis_status','pending')) makes the claim safe
  // even if two ticks overlap.
  async claimNextPending() {
    const { data: pick, error: selErr } = await getClient()
      .from(TABLE)
      .select('id')
      .eq('analysis_status', 'pending')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!pick) return null;

    const { data: claimed, error: upErr } = await getClient()
      .from(TABLE)
      .update({ analysis_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', pick.id)
      .eq('analysis_status', 'pending')
      .select('*')
      .maybeSingle();
    if (upErr) throw upErr;
    return claimed || null; // null => another tick grabbed it first
  },

  // Store a successful analysis result and mark completed.
  async completeAnalysis(id, parsed, opts = {}) {
    const patch = {
      name: parsed.name || undefined,
      email: parsed.email || undefined,
      phone: parsed.phone,
      skills: parsed.skills || [],
      education: parsed.education || [],
      experience: parsed.experience || [],
      projects: parsed.projects || [],
      certifications: parsed.certifications || [],
      languages: parsed.languages || [],
      githubUrl: parsed.githubUrl || '',
      linkedInUrl: parsed.linkedInUrl || '',
      portfolioUrl: parsed.portfolioUrl || '',
      aiAnalysis: parsed.aiAnalysis || {},
      analysisStatus: 'completed',
      analysisError: '',
    };
    // Only overwrite name/email when the parser actually found them (keep the
    // applicant-provided values otherwise).
    const row = toRow(patch);
    if (!parsed.name) delete row.name;
    if (!parsed.email) delete row.email;
    // NEVER overwrite the identity an applicant explicitly entered on the apply
    // form (a résumé written for a different name must not rename the applicant).
    if (opts.preserveName) delete row.name;
    if (opts.preserveEmail) delete row.email;
    if (opts.preservePhone) delete row.phone;
    row.updated_at = new Date().toISOString();
    const { error } = await getClient().from(TABLE).update(row).eq('id', id);
    if (error) throw error;
    return true;
  },

  async failAnalysis(id, message) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ analysis_status: 'failed', analysis_error: String(message || 'Analysis failed'), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Recovery: return any candidate stuck 'processing' (e.g. from a crash/restart)
  // longer than `minutes` back to 'pending'.
  async resetStaleProcessing(minutes = 10) {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ analysis_status: 'pending' })
      .eq('analysis_status', 'processing')
      .lt('updated_at', cutoff)
      .select('id');
    if (error) throw error;
    return (data || []).length;
  },

  async updateStatus(id, status) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const c = toApi(data);
    const jobs = await jobLookup([c.jobId], ['title', 'department']);
    c.jobId = jobs[String(c.jobId)] || c.jobId;
    return c;
  },

  async setNotes(id, notes) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('notes')
      .maybeSingle();
    if (error) throw error;
    return data ? data.notes || [] : null;
  },

  async setInterviews(id, interviews) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ interviews, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('interviews')
      .maybeSingle();
    if (error) throw error;
    return data ? data.interviews || [] : null;
  },

  // Move a candidate to a different job. Returns the updated candidate with the
  // new job populated ({_id,title,department}).
  async moveJob(id, jobId) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ job_id: jobId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const c = toApi(data);
    const jobs = await jobLookup([c.jobId], ['title', 'department']);
    c.jobId = jobs[String(c.jobId)] || c.jobId;
    return c;
  },

  // Overwrite the AI-derived fields after a re-analysis. Returns the full
  // candidate with the job populated ({_id,title,department}).
  async applyReanalysis(id, parsed) {
    const patch = {
      skills: parsed.skills || [],
      education: parsed.education || [],
      experience: parsed.experience || [],
      projects: parsed.projects || [],
      certifications: parsed.certifications || [],
      languages: parsed.languages || [],
      github_url: parsed.githubUrl || '',
      linkedin_url: parsed.linkedInUrl || '',
      portfolio_url: parsed.portfolioUrl || '',
      ai_analysis: parsed.aiAnalysis || {},
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await getClient()
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const c = toApi(data);
    const jobs = await jobLookup([c.jobId], ['title', 'department']);
    c.jobId = jobs[String(c.jobId)] || c.jobId;
    return c;
  },

  // Other candidates sharing an email (duplicate detection). Optionally exclude
  // one id (the current candidate).
  async findByEmail(email, excludeId) {
    if (!email) return [];
    let q = getClient()
      .from(TABLE)
      .select('id, name, email, job_id, status, created_at')
      .is('deleted_at', null)
      .ilike('email', email);
    if (excludeId) q = q.neq('id', excludeId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    const jobs = await jobLookup(rows.map((r) => r.job_id), ['title']);
    return rows.map((r) => ({
      _id: r.id,
      name: r.name,
      email: r.email,
      jobId: r.job_id,
      jobTitle: jobs[String(r.job_id)]?.title || 'Unknown role',
      status: r.status,
      createdAt: r.created_at,
    }));
  },

  // --- Careers portal (applicant self-service) ---------------------------
  // An applicant's own applications, matched by their verified email so résumés
  // submitted BEFORE they made an account are included. Job populated with the
  // fields the portal shows. Returns full candidate rows — the controller runs
  // them through the applicant-safe serializer before sending.
  async listForApplicant(email) {
    const e = String(email || '').toLowerCase();
    if (!e) return [];
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .ilike('email', e)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []).map(toApi);
    const jobs = await jobLookup(rows.map((c) => c.jobId), ['title', 'department', 'location', 'employment_type']);
    return rows.map((c) => ({ ...c, jobId: jobs[String(c.jobId)] || { _id: c.jobId, title: 'A role', department: '', location: '' } }));
  },

  // A single application, strictly scoped to the applicant's own email so one
  // applicant can never read another's record by guessing an id.
  async findForApplicant(id, email) {
    const e = String(email || '').toLowerCase();
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data || String(data.email || '').toLowerCase() !== e) return null;
    const c = toApi(data);
    const jobs = await jobLookup([c.jobId], ['title', 'department', 'location', 'employment_type', 'description']);
    c.jobId = jobs[String(c.jobId)] || { _id: c.jobId, title: 'A role' };
    return c;
  },

  // Has this email already applied to this job? Used to block duplicate public
  // applications to the same role.
  async existsForJobEmail(jobId, email) {
    const e = String(email || '').toLowerCase();
    if (!jobId || !e) return false;
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id')
      .eq('job_id', jobId)
      .is('deleted_at', null)
      .ilike('email', e)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  },

  // Soft delete → moves to Trash (recoverable). The résumé file is KEPT so a
  // restore is lossless; a periodic sweep hard-purges old trashed rows.
  async softDelete(id) {
    const now = new Date().toISOString();
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, name')
      .maybeSingle();
    if (error) throw error;
    return data ? { _id: data.id, name: data.name } : null;
  },

  // Restore a trashed candidate.
  async restore(id) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('id, name')
      .maybeSingle();
    if (error) throw error;
    return data ? { _id: data.id, name: data.name } : null;
  },

  // Trash view — soft-deleted candidates, newest-trashed first, job populated.
  async listTrash() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []).map(toApi);
    const jobs = await jobLookup(rows.map((c) => c.jobId), ['title', 'department']);
    return rows.map((c) => ({ ...c, jobId: jobs[String(c.jobId)] || { _id: c.jobId, title: 'Unknown', department: '' } }));
  },

  // Hard-delete (permanent) and return the removed candidate's resumeUrl for
  // storage cleanup. Works on any row (trashed or not).
  async remove(id) {
    const { data, error } = await getClient()
      .from(TABLE)
      .delete()
      .eq('id', id)
      .select('id, resume_url')
      .maybeSingle();
    if (error) throw error;
    return data ? { _id: data.id, resumeUrl: data.resume_url } : null;
  },

  // GDPR "delete this person": hard-delete EVERY application for an email
  // (trashed or not). Returns removed rows' résumé URLs for storage cleanup.
  async hardDeleteAllForEmail(email) {
    const e = String(email || '').toLowerCase();
    if (!e) return [];
    const { data, error } = await getClient()
      .from(TABLE)
      .delete()
      .ilike('email', e)
      .select('id, resume_url');
    if (error) throw error;
    return (data || []).map((r) => ({ _id: r.id, resumeUrl: r.resume_url }));
  },

  // Periodic sweep: permanently purge candidates trashed longer than `days`.
  async purgeTrashedOlderThan(days) {
    if (!days || days <= 0) return [];
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getClient()
      .from(TABLE)
      .delete()
      .lt('deleted_at', cutoff)
      .select('id, resume_url');
    if (error) throw error;
    return (data || []).map((r) => ({ _id: r.id, resumeUrl: r.resume_url }));
  },

  // Minimal projection for dashboard aggregation.
  async allForStats() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, job_id, status, skills, ai_analysis, created_at, updated_at')
      .is('deleted_at', null);
    if (error) throw error;
    return (data || []).map((r) => ({
      _id: r.id,
      jobId: r.job_id,
      status: r.status,
      skills: r.skills || [],
      overallScore: r.ai_analysis?.overallScore || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async count() {
    const { count, error } = await getClient()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (error) throw error;
    return count || 0;
  },

  // GDPR retention: delete candidates older than `days` (by created_at), EXCEPT
  // those marked 'Hired' (employees). Returns the removed rows' résumé URLs so
  // the caller can also delete the stored files.
  async purgeOlderThan(days) {
    if (!days || days <= 0) return [];
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getClient()
      .from(TABLE)
      .delete()
      .lt('created_at', cutoff)
      .neq('status', 'Hired')
      .select('id, resume_url');
    if (error) throw error;
    return (data || []).map((r) => ({ _id: r.id, resumeUrl: r.resume_url }));
  },
};

module.exports = CandidateRepo;
