const { getClient } = require('../config/supabase');
const { sanitizeUrl } = require('../utils/safeUrl');

const TABLE = 'candidates';

// Scrub project `link` fields (from AI extraction / manual entry) so a
// javascript: URL can never be stored and later rendered into an <a href>.
const sanitizeProjects = (projects) =>
  (Array.isArray(projects) ? projects : []).map((p) =>
    p && typeof p === 'object' && p.link !== undefined ? { ...p, link: sanitizeUrl(p.link) } : p
  );
// Dimension of the pgvector `embedding_vec` column / HNSW index. Pinned to the
// current embedding model (nvidia/nv-embedqa-e5-v5 = 1024). Vectors of a
// different size skip the pgvector fast-path (fall back to JS cosine).
const EMBEDDING_DIM = 1024;

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
    withdrawnAt: row.withdrawn_at || null,
    leadMetaId: row.lead_meta_id || null,
    resumeRequestedAt: row.resume_requested_at || null,
    resumeSubmittedAt: row.resume_submitted_at || null,
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
  if (data.projects !== undefined) row.projects = sanitizeProjects(data.projects);
  if (data.certifications !== undefined) row.certifications = data.certifications || [];
  if (data.languages !== undefined) row.languages = data.languages || [];
  // URL fields are scheme-sanitized (block javascript:/data: etc.) so a résumé-
  // or applicant-supplied link can never become a stored XSS vector.
  if (data.githubUrl !== undefined) row.github_url = sanitizeUrl(data.githubUrl);
  if (data.linkedInUrl !== undefined) row.linkedin_url = sanitizeUrl(data.linkedInUrl);
  if (data.portfolioUrl !== undefined) row.portfolio_url = sanitizeUrl(data.portfolioUrl);
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
  // Meta Lead Ads ingestion fields.
  if (data.leadMetaId !== undefined) row.lead_meta_id = data.leadMetaId;
  if (data.resumeUploadToken !== undefined) row.resume_upload_token = data.resumeUploadToken;
  if (data.resumeRequestedAt !== undefined) row.resume_requested_at = data.resumeRequestedAt;
  if (data.resumeSubmittedAt !== undefined) row.resume_submitted_at = data.resumeSubmittedAt;
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

// PostgREST returns at most 1000 rows per request (even with a larger .limit or
// .range). Page through with .range() so full-table reads — stats, analytics,
// the full lead list, per-job dedup — see EVERY row, not just the first 1000.
// `build` must return a FRESH query builder (with a stable .order) each call.
const PG_PAGE = 1000;
async function fetchAllRows(build) {
  const out = [];
  for (let from = 0; from <= 2000000; from += PG_PAGE) {
    const { data, error } = await build().range(from, from + PG_PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    out.push(...batch);
    if (batch.length < PG_PAGE) break;
  }
  return out;
}

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

  // Bulk-insert many candidates in one round-trip. Returns a light shape with the
  // fields the lead-import flow needs (id, name, phone, résumé url + upload token).
  async createMany(list) {
    if (!Array.isArray(list) || !list.length) return [];
    const { data, error } = await getClient()
      .from(TABLE)
      .insert(list.map(toRow))
      .select('id, name, phone, resume_url, resume_upload_token, job_id');
    if (error) throw error;
    return (data || []).map((r) => ({
      _id: r.id, name: r.name, phone: r.phone || '', jobId: r.job_id,
      resumeUrl: r.resume_url, resumeUploadToken: r.resume_upload_token,
    }));
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

  // SQL-side paginated + filtered list (the search_candidates RPC does all the
  // heavy filtering in Postgres, returning ONE page + the full match count — so
  // the whole candidates table is never loaded into Node). Duplicate detection is
  // bounded to the page's own emails instead of scanning the entire table.
  // Returns { rows, total, page, pageSize }.
  async listApiPaged({ jobId, status, minScore, search, skill, verdict, page = 1, pageSize = 25 } = {}) {
    const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 500);
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (p - 1) * limit;

    const { data, error } = await getClient().rpc('search_candidates', {
      p_job_id: jobId || null,
      p_status: status || null,
      p_min_score: minScore ? (parseInt(minScore, 10) || 0) : 0,
      p_search: search ? String(search).trim() : null,
      p_skill: skill ? String(skill).trim() : null,
      p_verdict: verdict || null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;

    const total = data && data.length ? Number(data[0].total_count) : 0;
    const rows = (data || []).map((r) => toApi(r.candidate));
    const mapped = await this.hydrateRows(rows);
    return { rows: mapped, total, page: p, pageSize: limit };
  },

  // Enrich a set of (toApi'd) candidate rows with the populated job object and
  // duplicate/other-application info — the per-page bounded lookups shared by the
  // normal list and the distance path (which sorts the full set, then hydrates
  // only the page slice). Preserves any extra fields already on each row (e.g.
  // distanceKm).
  async hydrateRows(rows) {
    if (!rows || !rows.length) return [];
    const emails = [...new Set(rows.map((c) => c.email).filter(Boolean))];
    const byEmail = {};
    if (emails.length) {
      const { data: others } = await getClient()
        .from(TABLE).select('id, email, job_id').is('deleted_at', null).in('email', emails);
      (others || []).forEach((r) => {
        const e = String(r.email || '').toLowerCase();
        if (e) (byEmail[e] = byEmail[e] || []).push(r);
      });
    }
    const jobIdsNeeded = new Set(rows.map((c) => String(c.jobId)));
    rows.forEach((c) => (byEmail[String(c.email || '').toLowerCase()] || []).forEach((r) => jobIdsNeeded.add(String(r.job_id))));
    const jobs = await jobLookup([...jobIdsNeeded], ['title', 'department']);

    return rows.map((c) => {
      const group = byEmail[String(c.email || '').toLowerCase()] || [];
      const sameJob = group.filter((r) => String(r.job_id) === String(c.jobId) && String(r.id) !== String(c._id));
      const otherJobIds = [...new Set(group.filter((r) => String(r.job_id) !== String(c.jobId)).map((r) => String(r.job_id)))];
      return {
        ...c,
        jobId: jobs[String(c.jobId)] || { _id: c.jobId, title: 'Unknown', department: 'Unknown' },
        isDuplicate: sameJob.length > 0,
        duplicateCount: sameJob.length + 1,
        otherApplications: otherJobIds.map((jid) => ({ _id: jid, title: jobs[jid]?.title || 'Unknown role' })),
      };
    });
  },

  // Fetch ALL candidates matching the given filters (up to `cap`), UNHYDRATED —
  // used by the distance sort, which must rank the whole matching set (not just
  // one page) before paginating. Returns { rows, total, capped }.
  async searchAllMatching({ jobId, status, minScore, search, skill, verdict } = {}, cap = 3000) {
    const limit = Math.min(Math.max(parseInt(cap, 10) || 3000, 1), 5000);
    const { data, error } = await getClient().rpc('search_candidates', {
      p_job_id: jobId || null,
      p_status: status || null,
      p_min_score: minScore ? (parseInt(minScore, 10) || 0) : 0,
      p_search: search ? String(search).trim() : null,
      p_skill: skill ? String(skill).trim() : null,
      p_verdict: verdict || null,
      p_limit: limit,
      p_offset: 0,
    });
    if (error) throw error;
    const total = data && data.length ? Number(data[0].total_count) : 0;
    const rows = (data || []).map((r) => toApi(r.candidate));
    return { rows, total, capped: total > rows.length };
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
      // Tag where this analysis came from (résumé vs the manual form) so the UI
      // can label it. For a manual entry we also keep the manualEntry flag.
      aiAnalysis: {
        ...(parsed.aiAnalysis || {}),
        ...(opts.analyzedFrom ? { analyzedFrom: opts.analyzedFrom } : {}),
        ...(opts.analyzedFrom === 'form' ? { manualEntry: true } : {}),
      },
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
    // Manual entries: keep the applicant's own structured details — the AI report
    // adds the insights/score but must not overwrite what they entered.
    if (opts.preserveProfile) {
      delete row.skills; delete row.education; delete row.experience;
      delete row.projects; delete row.certifications; delete row.languages;
    }
    row.updated_at = new Date().toISOString();
    const { error } = await getClient().from(TABLE).update(row).eq('id', id).is('deleted_at', null);
    if (error) throw error;
    return true;
  },

  // Re-queue a candidate for the background analysis worker (Re-run AI Analysis).
  // Async by design — the request returns instantly and the worker re-processes
  // (résumé or manual entry), so the UI can show progress instead of blocking on
  // a slow AI call. Returns the updated (populated) candidate.
  async requeueForAnalysis(id) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ analysis_status: 'pending', analysis_error: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) throw error;
    return this.findByIdApi(id);
  },

  // Mark analysis complete WITHOUT changing the stored aiAnalysis — used to
  // finalize a manual entry when AI is unavailable (keeps its deterministic
  // baseline score) so it never ends up 'failed' or stuck 'pending'.
  async markCompleted(id) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ analysis_status: 'completed', analysis_error: '', updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) throw error;
    return true;
  },

  // Reject an upload that is NOT a résumé/CV (e.g. an ID card) — no AI is spent.
  // The reason is applicant-safe (surfaced in the portal). For an applicant's own
  // application (source 'Application') the pipeline status is also set to
  // 'Rejected' so it leaves the active list; recruiter uploads keep their status
  // and just show the rejected-analysis reason so the recruiter can re-upload.
  async rejectAsNonResume(id, reason, { rejectApplication = false } = {}) {
    const patch = {
      analysis_status: 'rejected',
      analysis_error: String(reason || 'The uploaded file is not a valid résumé/CV.'),
      updated_at: new Date().toISOString(),
    };
    if (rejectApplication) patch.status = 'Rejected';
    const { error } = await getClient().from(TABLE).update(patch).eq('id', id).is('deleted_at', null);
    if (error) throw error;
    return true;
  },

  async failAnalysis(id, message) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ analysis_status: 'failed', analysis_error: String(message || 'Analysis failed'), updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null); // don't write onto a trashed candidate
    if (error) throw error;
    return true;
  },

  // Has this candidate been trashed (or hard-deleted)? Used by the worker to bail
  // BEFORE the expensive AI call when a recruiter deletes a candidate mid-analysis
  // — so no AI credit is spent on a résumé that's already been removed.
  async isDeleted(id) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return !data || data.deleted_at != null; // vanished (hard-deleted) counts as deleted
  },

  // Release a claimed candidate back to the queue (processing -> pending). If it
  // was trashed mid-analysis this leaves it inert (claimNextPending filters
  // deleted rows) yet ready to re-analyze automatically if it's later restored.
  async revertToPending(id) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ analysis_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('analysis_status', 'processing');
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
      projects: sanitizeProjects(parsed.projects || []),
      certifications: parsed.certifications || [],
      languages: parsed.languages || [],
      github_url: sanitizeUrl(parsed.githubUrl || ''),
      linkedin_url: sanitizeUrl(parsed.linkedInUrl || ''),
      portfolio_url: sanitizeUrl(parsed.portfolioUrl || ''),
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
  // SECURITY: scoped by applicant_id — the account that actually submitted the
  // application — NOT by email. Email is a claim anyone can make: portal sign-up
  // does not verify ownership, so matching on it let anyone who knew a
  // candidate's address register with it and read that person's applications.
  // Only rows created by a session holding this account are ever returned.
  // Consequence: applications submitted while logged OUT carry applicant_id null
  // and are not listed here. Restoring that needs verified email ownership.
  async listForApplicant(applicantId) {
    if (!applicantId) return [];
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []).map(toApi);
    const jobs = await jobLookup(rows.map((c) => c.jobId), ['title', 'department', 'location', 'employment_type']);
    return rows.map((c) => ({ ...c, jobId: jobs[String(c.jobId)] || { _id: c.jobId, title: 'A role', department: '', location: '' } }));
  },

  // A single application, strictly scoped to the owning ACCOUNT (applicant_id)
  // so one applicant can never read another's record by guessing an id — or by
  // registering with someone else's email address. See listForApplicant.
  async findForApplicant(id, applicantId) {
    if (!applicantId) return null;
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data || String(data.applicant_id || '') !== String(applicantId)) return null;
    const c = toApi(data);
    const jobs = await jobLookup([c.jobId], ['title', 'department', 'location', 'employment_type', 'description']);
    c.jobId = jobs[String(c.jobId)] || { _id: c.jobId, title: 'A role' };
    return c;
  },

  // Applicant self-withdrawal, strictly scoped to the owning ACCOUNT. Marks
  // withdrawn_at + closes the row (status 'Rejected') so it exits the active
  // recruiter pipeline. Refuses if the application is already Hired, already
  // withdrawn, or doesn't belong to this applicant. Returns the updated row
  // (toApi) or null when not withdrawable. Ownership is applicant_id, never
  // email — an email match let a squatter withdraw someone else's application.
  async withdrawForApplicant(id, applicantId) {
    if (!applicantId) return null;
    const { data: existing, error: findErr } = await getClient()
      .from(TABLE).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (findErr) throw findErr;
    if (!existing || String(existing.applicant_id || '') !== String(applicantId)) return null;
    if (existing.withdrawn_at || existing.status === 'Hired' || existing.status === 'Rejected') return null;

    const { data, error } = await getClient()
      .from(TABLE)
      .update({ withdrawn_at: new Date().toISOString(), status: 'Rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return toApi(data);
  },

  // --- Meta Lead Ads ingestion ---------------------------------------------
  // Dedup a re-synced lead by Meta's leadgen id (unique per submission).
  async findByLeadMetaId(leadMetaId) {
    if (!leadMetaId) return null;
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id')
      .eq('lead_meta_id', String(leadMetaId))
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? { _id: data.id } : null;
  },

  // Look up a lead candidate by its résumé-upload token (the WhatsApp link).
  // Returns minimal fields for the public upload page (no recruiter data).
  async findByUploadToken(token) {
    if (!token) return null;
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, name, job_id, resume_url, resume_submitted_at, resume_requested_at, created_at')
      .eq('resume_upload_token', String(token))
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      _id: data.id, name: data.name, jobId: data.job_id,
      resumeUrl: data.resume_url, resumeSubmittedAt: data.resume_submitted_at || null,
      requestedAt: data.resume_requested_at || null, createdAt: data.created_at || null,
    };
  },

  // Attach a résumé to a lead candidate via its upload token and REQUEUE analysis
  // (analysis_status -> 'pending' so the worker scores it). Scoped to the token.
  async attachResumeByToken(token, resumeUrl) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({
        resume_url: resumeUrl,
        analysis_status: 'pending',
        analysis_error: null,
        resume_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('resume_upload_token', String(token))
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? toApi(data) : null;
  },

  // Find the lead candidate a WhatsApp résumé reply belongs to, by sender phone.
  // Scans only the small "awaiting a résumé" subset (résumé null, source Lead/Sheet)
  // and matches on digits — exact first, then last-10-digit suffix (handles a
  // stored "+91 98765 43210" vs an inbound "919876543210"). Most-recent wins.
  async findPendingLeadByPhone(rawPhone) {
    const norm = (p) => String(p || '').replace(/\D/g, '');
    const target = norm(rawPhone);
    if (!target) return null;
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, name, phone, job_id, resume_upload_token')
      .is('resume_url', null)
      .is('deleted_at', null)
      .in('source', ['Lead', 'Sheet'])
      .order('resume_requested_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = data || [];
    const tsuf = target.slice(-10);
    let m = rows.find((r) => norm(r.phone) === target);
    if (!m && tsuf.length >= 8) m = rows.find((r) => norm(r.phone).slice(-10) === tsuf);
    if (!m) return null;
    return { _id: m.id, name: m.name, jobId: m.job_id, resumeUploadToken: m.resume_upload_token };
  },

  // Attach a résumé to a lead by id and REQUEUE analysis. Idempotent: only fills
  // an EMPTY résumé slot (resume_url is null), so a duplicate inbound message
  // can't overwrite an already-received résumé or re-queue paid analysis.
  async attachResumeById(id, resumeUrl) {
    const { data, error } = await getClient()
      .from(TABLE)
      .update({
        resume_url: resumeUrl,
        analysis_status: 'pending',
        analysis_error: null,
        resume_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('resume_url', null)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? toApi(data) : null;
  },

  // Mark that the résumé-request WhatsApp message was sent.
  async markResumeRequested(id) {
    const { error } = await getClient()
      .from(TABLE)
      .update({ resume_requested_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // List automation leads (source Lead / Sheet) for the Leads section — newest
  // first, job title populated, a light projection (no résumé body / skills).
  // One filtered + sorted PAGE of automation leads, plus the exact match count.
  // Server-paginated so the Leads screen never pulls the whole pool to the browser
  // (that was 7MB/8s at 17k leads). leadStatus maps to résumé-flow predicates.
  async listLeadsPaged({ jobId, source, leadStatus, search, page = 1, pageSize = 15 } = {}) {
    const limit = Math.min(Math.max(parseInt(pageSize, 10) || 15, 1), 100);
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (p - 1) * limit;

    const withFilters = (q) => {
      q = q.is('deleted_at', null).in('source', ['Lead', 'Sheet']);
      if (jobId) q = q.eq('job_id', jobId);
      if (source === 'Lead' || source === 'Sheet') q = q.eq('source', source);
      if (leadStatus === 'no_request') q = q.is('resume_url', null).is('resume_requested_at', null);
      else if (leadStatus === 'awaiting') q = q.is('resume_url', null).not('resume_requested_at', 'is', null);
      else if (leadStatus === 'analyzing') q = q.not('resume_url', 'is', null).in('analysis_status', ['pending', 'processing']);
      else if (leadStatus === 'failed') q = q.not('resume_url', 'is', null).eq('analysis_status', 'failed');
      else if (leadStatus === 'analyzed') q = q.not('resume_url', 'is', null).eq('analysis_status', 'completed');
      // Strip PostgREST filter metacharacters before interpolating into .or().
      const s = String(search || '').replace(/[,()%*:]/g, ' ').trim();
      if (s) q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      return q;
    };

    const { count, error: cErr } = await withFilters(
      getClient().from(TABLE).select('id', { count: 'exact', head: true })
    );
    if (cErr) throw cErr;

    const { data, error } = await withFilters(
      getClient().from(TABLE).select('id, name, email, phone, source, resume_url, analysis_status, resume_requested_at, resume_submitted_at, ai_analysis, job_id, created_at')
    ).order('created_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + limit - 1);
    if (error) throw error;

    const jobs = await jobLookup((data || []).map((r) => r.job_id), ['title', 'department']);
    const rows = (data || []).map((r) => {
      const ai = r.ai_analysis && typeof r.ai_analysis === 'object' ? r.ai_analysis : {};
      return {
        _id: r.id, name: r.name, email: r.email, phone: r.phone || '', source: r.source,
        hasResume: !!r.resume_url, analysisStatus: r.analysis_status || 'completed',
        overallScore: ai.overallScore ?? null, verdict: ai.verdict || ai.recommendation || '',
        resumeRequestedAt: r.resume_requested_at || null, resumeSubmittedAt: r.resume_submitted_at || null,
        job: jobs[String(r.job_id)] || null, createdAt: r.created_at,
      };
    });
    return { rows, total: count || 0, page: p, pageSize: limit };
  },

  // Exact lead stat-card counts (optionally scoped to a job) — count queries, so
  // they're accurate regardless of pool size and never fetch rows.
  async leadStats(jobId) {
    const base = () => {
      let q = getClient().from(TABLE).select('id', { count: 'exact', head: true }).is('deleted_at', null).in('source', ['Lead', 'Sheet']);
      if (jobId) q = q.eq('job_id', jobId);
      return q;
    };
    const run = async (q) => { const { count, error } = await q; if (error) throw error; return count || 0; };
    const [total, received, awaiting, noRequest, analyzed] = await Promise.all([
      run(base()),
      run(base().not('resume_url', 'is', null)),
      run(base().is('resume_url', null).not('resume_requested_at', 'is', null)),
      run(base().is('resume_url', null).is('resume_requested_at', null)),
      run(base().not('resume_url', 'is', null).eq('analysis_status', 'completed')),
    ]);
    return { total, received, awaiting, noRequest, analyzed };
  },

  // Minimal fields needed to (re)send a lead's résumé-request over WhatsApp.
  async findLeadForResend(id) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, name, phone, job_id, resume_url, resume_upload_token, source')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      _id: data.id, name: data.name, phone: data.phone || '', jobId: data.job_id,
      resumeUrl: data.resume_url, resumeUploadToken: data.resume_upload_token, source: data.source,
    };
  },

  // Has this email already applied to this job? Used to block duplicate public
  // applications to the same role.
  // Existing email/phone/job pairs across the given jobs — used to dedup a bulk
  // lead import in ONE query (instead of a query per row), keyed per job.
  async listIdentitiesForJobs(jobIds) {
    const ids = [...new Set((jobIds || []).filter(Boolean).map(String))];
    if (!ids.length) return [];
    return fetchAllRows(() =>
      getClient()
        .from(TABLE)
        .select('email, phone, job_id')
        .in('job_id', ids)
        .is('deleted_at', null)
        .order('id', { ascending: true })
    );
  },

  // Leads still awaiting a résumé (no résumé yet) with a phone — for a bulk
  // WhatsApp résumé-request send. Optionally scoped to one job.
  async listLeadsAwaitingResume(jobId) {
    const data = await fetchAllRows(() => {
      let q = getClient()
        .from(TABLE)
        .select('id, name, phone, job_id, resume_upload_token')
        .is('resume_url', null)
        .is('deleted_at', null)
        .in('source', ['Lead', 'Sheet']);
      if (jobId) q = q.eq('job_id', jobId);
      return q.order('created_at', { ascending: false }).order('id', { ascending: true });
    });
    return data
      .filter((r) => r.phone && r.resume_upload_token)
      .map((r) => ({ _id: r.id, name: r.name, phone: r.phone, jobId: r.job_id, resumeUploadToken: r.resume_upload_token }));
  },

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

  // Duplicate check for a SIGNED-IN applicant: has this ACCOUNT already applied
  // to this job? Used instead of the email check so a stranger who submits an
  // anonymous application using someone else's address cannot occupy that
  // person's slot and lock the real owner out of the role (denial-of-application).
  async existsForJobApplicant(jobId, applicantId) {
    if (!jobId || !applicantId) return false;
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id')
      .eq('job_id', jobId)
      .eq('applicant_id', applicantId)
      .is('deleted_at', null)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  },

  // Count applications created by an email since `sinceIso` (rolling-window cap on
  // public submissions, to bound AI-analysis cost from one email fanning roles).
  async countRecentByEmail(email, sinceIso) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return 0;
    const { count, error } = await getClient()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .ilike('email', e)
      .gte('created_at', sinceIso);
    if (error) throw error;
    return count || 0;
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

  // Count non-trashed applications per (lowercased) email — used to show how
  // many roles each portal account has applied to.
  async applicationCountsByEmail() {
    const { data, error } = await getClient().from(TABLE).select('email').is('deleted_at', null);
    if (error) throw error;
    const counts = {};
    (data || []).forEach((r) => {
      const e = String(r.email || '').toLowerCase();
      if (e) counts[e] = (counts[e] || 0) + 1;
    });
    return counts;
  },

  // Minimal projection for dashboard aggregation.
  // Exact per-stage candidate counts for a job's pipeline board — one indexed
  // count per stage, in parallel. Accurate regardless of pool size (no 1000 cap,
  // since counts don't return rows).
  async stageCountsForJob(jobId, stages) {
    if (!jobId || !Array.isArray(stages)) return {};
    const entries = await Promise.all(
      stages.map(async (s) => {
        const { count, error } = await getClient()
          .from(TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .eq('status', s)
          .is('deleted_at', null);
        if (error) throw error;
        return [s, count || 0];
      })
    );
    return Object.fromEntries(entries);
  },

  async allForStats() {
    const data = await fetchAllRows(() =>
      getClient()
        .from(TABLE)
        .select('id, job_id, status, skills, ai_analysis, created_at, updated_at')
        .is('deleted_at', null)
        .order('id', { ascending: true })
    );
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

  // Richer projection for the recruiter analytics page (adds source, AI verdict,
  // seniority, quiz score). Kept separate from allForStats so the existing
  // dashboard payload is untouched.
  async allForAnalytics() {
    const data = await fetchAllRows(() =>
      getClient()
        .from(TABLE)
        .select('id, job_id, status, source, ai_analysis, quiz_result, analysis_status, created_at, updated_at')
        .is('deleted_at', null)
        .order('id', { ascending: true })
    );
    return (data || []).map((r) => ({
      _id: r.id,
      jobId: r.job_id,
      status: r.status,
      source: r.source || 'Manual',
      overallScore: r.ai_analysis?.overallScore || 0,
      screeningVerdict: r.ai_analysis?.screeningVerdict || null,
      seniorityLevel: r.ai_analysis?.seniorityLevel || null,
      quizScore: (r.quiz_result && typeof r.quiz_result.score === 'number') ? r.quiz_result.score : null,
      analysisStatus: r.analysis_status || 'completed',
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

  // --- Semantic matching embeddings ----------------------------------------
  // Persist a candidate's embedding (JSON float array) + the model tag that
  // produced it. Also mirrors it into the pgvector `embedding_vec` column (as the
  // pgvector text form) when it matches the indexed dimension, so nearest-
  // neighbour search stays in Postgres. Best-effort — callers swallow errors.
  async setEmbedding(id, vector, modelTag) {
    const vec = Array.isArray(vector) && vector.length === EMBEDDING_DIM ? `[${vector.join(',')}]` : null;
    const { error } = await getClient()
      .from(TABLE)
      .update({ embedding: vector || null, embedding_model: modelTag || null, embedding_vec: vec })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // pgvector nearest-neighbour search: top-K analysed candidates most similar to
  // a job's embedding, WITHOUT loading the whole pool. Returns
  // [{ candidate (API-shaped), similarity 0..1 }]. jobVector is a float array.
  async matchByEmbedding(jobVector, limit = 250) {
    if (!Array.isArray(jobVector) || jobVector.length !== EMBEDDING_DIM) return [];
    const { data, error } = await getClient().rpc('match_candidates', {
      p_job_embedding: `[${jobVector.join(',')}]`,
      p_limit: limit,
    });
    if (error) throw error;
    return (data || []).map((r) => ({ candidate: toApi(r.candidate), similarity: r.similarity }));
  },

  // All non-deleted candidates for one job (its own applicants). Small, bounded.
  async listForJob(jobId) {
    if (!jobId) return [];
    const { data, error } = await getClient()
      .from(TABLE).select('*').eq('job_id', jobId).is('deleted_at', null);
    if (error) throw error;
    return (data || []).map(toApi);
  },

  // Replace each candidate's raw jobId with its populated { _id, title, department }
  // (batched) — mirrors what listApi does, for the bounded pgvector path.
  async populateAppliedJobs(rows) {
    const jobs = await jobLookup((rows || []).map((c) => c.jobId), ['title', 'department']);
    return (rows || []).map((c) => ({
      ...c,
      jobId: jobs[String(c.jobId)] || { _id: c.jobId, title: 'Unknown', department: '' },
    }));
  },

  // Fetch embeddings for a set of candidate ids → { [id]: { embedding, embeddingModel } }.
  // Kept out of toApi so the 1k-float vectors never bloat normal candidate reads.
  async embeddingsByIds(ids) {
    const list = [...new Set((ids || []).map(String))].filter(Boolean);
    if (!list.length) return {};
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, embedding, embedding_model')
      .in('id', list);
    if (error) throw error;
    const map = {};
    (data || []).forEach((r) => {
      if (r.embedding) map[r.id] = { embedding: r.embedding, embeddingModel: r.embedding_model || null };
    });
    return map;
  },

  // Analysed candidates that still lack an embedding (for the backfill sweep).
  async listNeedingEmbedding(limit = 200) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .is('deleted_at', null)
      .is('embedding', null)
      .eq('analysis_status', 'completed')
      .limit(limit);
    if (error) throw error;
    return (data || []).map(toApi);
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
