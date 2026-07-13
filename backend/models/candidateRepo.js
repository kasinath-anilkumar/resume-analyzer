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
    status: row.status,
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
  if (data.status !== undefined) row.status = data.status;
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
    let q = getClient().from(TABLE).select('*');
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

    const jobs = await jobLookup(rows.map((c) => c.jobId), ['title', 'department']);
    return rows.map((c) => ({
      ...c,
      jobId: jobs[String(c.jobId)] || { _id: c.jobId, title: 'Unknown', department: 'Unknown' },
    }));
  },

  // Single candidate with a richer populated job object.
  async findByIdApi(id) {
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).maybeSingle();
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

  // Delete and return the removed candidate's resumeUrl for storage cleanup.
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

  // Minimal projection for dashboard aggregation.
  async allForStats() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('id, job_id, status, skills, ai_analysis, created_at, updated_at');
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
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },
};

module.exports = CandidateRepo;
