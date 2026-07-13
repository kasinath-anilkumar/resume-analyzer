const { getClient } = require('../config/supabase');

const TABLE = 'jobs';

const toApi = (row) =>
  row && {
    _id: row.id,
    title: row.title,
    department: row.department,
    description: row.description,
    requiredSkills: row.required_skills || [],
    preferredSkills: row.preferred_skills || [],
    experience: row.experience,
    salaryRange: row.salary_range || '',
    employmentType: row.employment_type,
    location: row.location,
    numberOpenings: row.number_openings,
    status: row.status,
    screeningQuestions: row.screening_questions || [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

const asArray = (v) => {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

// Map an API/body object to DB columns. Only defined keys are included so this
// works for both create and partial update.
const toRow = (data = {}) => {
  const row = {};
  if (data.title !== undefined) row.title = data.title;
  if (data.department !== undefined) row.department = data.department;
  if (data.description !== undefined) row.description = data.description;
  if (data.requiredSkills !== undefined) row.required_skills = asArray(data.requiredSkills);
  if (data.preferredSkills !== undefined) row.preferred_skills = asArray(data.preferredSkills);
  if (data.experience !== undefined) row.experience = data.experience;
  if (data.salaryRange !== undefined) row.salary_range = data.salaryRange;
  if (data.employmentType !== undefined) row.employment_type = data.employmentType;
  if (data.location !== undefined) row.location = data.location;
  if (data.numberOpenings !== undefined) row.number_openings = data.numberOpenings;
  if (data.status !== undefined) row.status = data.status;
  if (data.screeningQuestions !== undefined) {
    row.screening_questions = Array.isArray(data.screeningQuestions)
      ? data.screeningQuestions.map((q) => String(q).trim()).filter(Boolean)
      : [];
  }
  return row;
};

// Strip characters that would break a PostgREST or()/ilike filter expression.
const sanitize = (s) => String(s || '').replace(/[,()%]/g, ' ').trim();

const JobRepo = {
  toApi,

  async list({ status, department, location, employmentType, search } = {}) {
    let q = getClient().from(TABLE).select('*');

    if (status) q = q.eq('status', status);
    else q = q.neq('status', 'Archived');

    if (department) q = q.eq('department', department);
    if (location) q = q.eq('location', location);
    if (employmentType) q = q.eq('employment_type', employmentType);

    if (search) {
      const s = sanitize(search);
      if (s) q = q.or(`title.ilike.%${s}%,department.ilike.%${s}%,description.ilike.%${s}%`);
    }

    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(toApi);
  },

  async findById(id) {
    const { data, error } = await getClient().from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return toApi(data);
  },

  async create(data, userId) {
    const row = { ...toRow(data), created_by: userId || null };
    if (row.number_openings === undefined || row.number_openings === null) row.number_openings = 1;
    if (!row.status) row.status = 'Active';
    const { data: created, error } = await getClient().from(TABLE).insert(row).select('*').single();
    if (error) throw error;
    return toApi(created);
  },

  async update(id, data) {
    const row = { ...toRow(data), updated_at: new Date().toISOString() };
    const { data: updated, error } = await getClient()
      .from(TABLE)
      .update(row)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return toApi(updated);
  },

  async remove(id) {
    // candidates rows cascade-delete via the job_id foreign key.
    const { error } = await getClient().from(TABLE).delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async count({ status } = {}) {
    let q = getClient().from(TABLE).select('id', { count: 'exact', head: true });
    if (status) q = q.eq('status', status);
    else q = q.neq('status', 'Archived');
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  },

  // --- Public (careers page) — Active jobs only, safe fields ---------------
  toPublic(row) {
    const j = toApi(row);
    if (!j) return j;
    return {
      _id: j._id,
      title: j.title,
      department: j.department,
      description: j.description,
      requiredSkills: j.requiredSkills,
      preferredSkills: j.preferredSkills,
      experience: j.experience,
      salaryRange: j.salaryRange,
      employmentType: j.employmentType,
      location: j.location,
      screeningQuestions: j.screeningQuestions,
      createdAt: j.createdAt,
    };
  },

  async listPublic() {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .eq('status', 'Active')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => this.toPublic(r));
  },

  async findPublicById(id) {
    const { data, error } = await getClient()
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('status', 'Active')
      .maybeSingle();
    if (error) throw error;
    return data ? this.toPublic(data) : null;
  },
};

module.exports = JobRepo;
