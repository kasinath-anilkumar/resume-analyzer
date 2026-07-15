-- =============================================================================
--  PARAKKAT ATS — Supabase / Postgres schema
-- =============================================================================
--  Run this once in the Supabase SQL Editor (Dashboard → SQL → New query) to
--  create every table the backend needs. The app talks to these tables via
--  @supabase/supabase-js using the service-role key, so Row Level Security is
--  left disabled (all access is server-side and already gated by JWT + roles).
--
--  Nested/array data that used to live inside Mongo documents is stored as:
--    - text[]  for simple string lists (skills, certifications, departments…)
--    - jsonb   for structured objects/arrays (education, experience, projects,
--              notes, aiAnalysis) — their inner keys stay camelCase, matching
--              the API/JSON the frontend already consumes.
-- =============================================================================

create extension if not exists pgcrypto;   -- provides gen_random_uuid()

-- ---------------------------------------------------------------------------
--  users
-- ---------------------------------------------------------------------------
create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,
  password   text not null,                -- bcrypt hash (never returned to clients)
  role       text not null default 'Recruiter'
             check (role in ('Admin', 'Recruiter', 'Hiring Manager')),
  reset_token_hash    text,                 -- sha256 of the emailed reset token
  reset_token_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- For installs created before the reset columns existed:
alter table users add column if not exists reset_token_hash text;
alter table users add column if not exists reset_token_expires timestamptz;

-- ---------------------------------------------------------------------------
--  applicants  (candidate-facing careers portal accounts — SEPARATE from the
--  recruiter `users` table above. Applicants self-register on the public
--  careers portal; they can only ever see their own applications.)
-- ---------------------------------------------------------------------------
create table if not exists applicants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,           -- stored lowercased
  password   text not null,                  -- bcrypt hash (never returned to clients)
  phone      text,
  reset_token_hash    text,                   -- sha256 of the emailed reset token
  reset_token_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applicants_email_idx on applicants(lower(email));
-- Self-service profile fields (careers portal → Profile page).
alter table applicants add column if not exists linkedin_url  text;
alter table applicants add column if not exists portfolio_url text;
alter table applicants add column if not exists bio          text;
alter table applicants add column if not exists resume_url   text;  -- reusable "primary résumé"
alter table applicants add column if not exists location     text;  -- current location

-- ---------------------------------------------------------------------------
--  jobs
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  department       text not null,
  description      text not null,
  required_skills  text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  experience       text not null,
  salary_range     text,
  employment_type  text not null default 'Full-time'
                   check (employment_type in ('Full-time','Part-time','Contract','Internship','Remote')),
  location         text not null,
  number_openings  integer not null default 1,
  status           text not null default 'Active'
                   check (status in ('Active','Closed','Draft','Archived')),
  screening_questions jsonb not null default '[]', -- optional applicant questions (array of strings)
  quiz             jsonb not null default '{}',    -- { timeLimitMinutes, questions:[{id,type,question,options,correctIndex}] }
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists jobs_status_idx on jobs(status);
alter table jobs add column if not exists screening_questions jsonb not null default '[]';
alter table jobs add column if not exists quiz jsonb not null default '{}';
-- Semantic matching: an embedding of the role text (jsonb float array) + the model
-- tag that produced it. Stored as jsonb (not pgvector) so it stays provider-agnostic
-- on dimensionality — switching the embedding provider never requires a column
-- migration. Cosine similarity is computed in JS (fine at this scale; pgvector +
-- an ANN index is the future upgrade once the pool reaches thousands of rows).
alter table jobs add column if not exists embedding jsonb;
alter table jobs add column if not exists embedding_model text;
-- Meta Lead Ads mapping: a job can be linked to a Meta lead form so its leads
-- auto-ingest as candidates for this role. meta_lead_cursor is the per-form
-- watermark (last lead created_time synced) for idempotent incremental fetches.
alter table jobs add column if not exists meta_form_id text;
alter table jobs add column if not exists meta_lead_cursor timestamptz;
create index if not exists jobs_meta_form_id_idx on jobs(meta_form_id);

-- ---------------------------------------------------------------------------
--  candidates
-- ---------------------------------------------------------------------------
create table if not exists candidates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text not null,
  phone          text,
  resume_url     text not null,
  skills         text[] not null default '{}',
  education      jsonb  not null default '[]',
  experience     jsonb  not null default '[]',
  projects       jsonb  not null default '[]',
  certifications text[] not null default '{}',
  languages      text[] not null default '{}',
  github_url     text,
  linkedin_url   text,
  portfolio_url  text,
  notes          jsonb  not null default '[]',   -- [{ _id, note, author:{_id,name,role}, createdAt }]
  interviews     jsonb  not null default '[]',   -- [{ _id, stage, scheduledAt, mode, locationOrLink, interviewer, notes, createdAt }]
  status         text not null default 'Applied'
                 check (status in ('Applied','Screening','Shortlisted','Interview',
                                   'Technical Round','HR Round','Offer','Hired','Rejected')),
  job_id         uuid not null references jobs(id) on delete cascade,
  ai_analysis    jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists candidates_job_id_idx on candidates(job_id);
create index if not exists candidates_status_idx on candidates(status);
create index if not exists candidates_email_idx on candidates(lower(email));
-- For installs created before these columns existed:
alter table candidates add column if not exists interviews jsonb not null default '[]';
alter table candidates add column if not exists source text not null default 'Manual';        -- Manual | Application
alter table candidates add column if not exists screening_answers jsonb not null default '[]'; -- [{question, answer}]
-- Async analysis pipeline: résumé parsing + AI scoring runs in a background
-- worker so uploads return instantly. Existing rows default to 'completed'.
alter table candidates add column if not exists analysis_status text not null default 'completed'
  check (analysis_status in ('pending','processing','completed','failed'));
alter table candidates add column if not exists analysis_error text;
create index if not exists candidates_analysis_status_idx on candidates(analysis_status);
-- Screening quiz result (auto-scored MCQ): { score, correct, totalScored, answers[], timeSpentSeconds, tabSwitches }
alter table candidates add column if not exists quiz_result jsonb not null default '{}';
-- GDPR consent timestamp (set when an applicant submits via the public portal)
alter table candidates add column if not exists consent_at timestamptz;
-- Careers-portal account that owns this application (nullable; anonymous applies
-- stay null and are matched to a portal account by email). ON DELETE SET NULL so
-- deleting a portal account never cascades away the application record.
alter table candidates add column if not exists applicant_id uuid references applicants(id) on delete set null;
create index if not exists candidates_applicant_id_idx on candidates(applicant_id);
-- Applicant-provided details captured on the public apply form.
alter table candidates add column if not exists current_location text;
alter table candidates add column if not exists salary_expectation text;
-- Soft delete ("Trash"): non-null = trashed (recoverable). All normal reads
-- exclude these; a periodic sweep purges rows trashed longer than the window.
alter table candidates add column if not exists deleted_at timestamptz;
create index if not exists candidates_deleted_at_idx on candidates(deleted_at);
-- Manually-added candidates have no résumé on file, so the URL is optional.
alter table candidates alter column resume_url drop not null;
-- Semantic matching embedding (see the jobs.embedding note above). Generated by the
-- analysis worker after a résumé is parsed, and by the backfill endpoint.
alter table candidates add column if not exists embedding jsonb;
alter table candidates add column if not exists embedding_model text;
-- Applicant self-service withdrawal (careers portal). Non-null = the candidate
-- pulled out; the row's status is also set to 'Rejected' so it leaves the active
-- recruiter pipeline, while this timestamp preserves that it was self-withdrawn
-- (vs recruiter-rejected).
alter table candidates add column if not exists withdrawn_at timestamptz;
-- Meta Lead Ads ingestion (source='Lead'). lead_meta_id is Meta's leadgen id used
-- to dedupe re-syncs. resume_upload_token backs the personal WhatsApp upload link
-- (${APP_URL}/u/<token>); the requested/submitted timestamps track that flow.
alter table candidates add column if not exists lead_meta_id text;
alter table candidates add column if not exists resume_upload_token text;
alter table candidates add column if not exists resume_requested_at timestamptz;
alter table candidates add column if not exists resume_submitted_at timestamptz;
create unique index if not exists candidates_lead_meta_id_idx on candidates(lead_meta_id) where lead_meta_id is not null;
create unique index if not exists candidates_resume_upload_token_idx on candidates(resume_upload_token) where resume_upload_token is not null;

-- ---------------------------------------------------------------------------
--  notifications
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  title       text default '',
  message     text not null,
  sender      uuid references users(id) on delete set null,
  sender_name text default 'Admin',
  target_type text not null check (target_type in ('all','role','user')),
  target_role text check (target_role in ('Admin','Recruiter','Hiring Manager')),
  target_user uuid references users(id) on delete cascade,
  read_by     uuid[] not null default '{}',      -- user ids who have read it
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notifications_created_at_idx on notifications(created_at desc);

-- ---------------------------------------------------------------------------
--  settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id           integer primary key default 1,
  departments  text[]  not null default '{}',
  locations    text[]  not null default '{}',
  min_ai_score integer not null default 60,
  ai_provider  text    not null default 'mock',
  ai_api_key   text    not null default '',
  ai_model     text    not null default '',
  retention_days integer not null default 0, -- 0 = keep forever; >0 auto-purges old candidates (GDPR)
  updated_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);
-- For installs created before the ai_model column existed:
alter table settings add column if not exists ai_model text not null default '';

alter table settings add column if not exists retention_days integer not null default 0;

-- Meta Lead Ads + WhatsApp integration (auto-ingest job leads, request résumés).
-- Tokens are stored ENCRYPTED at rest via utils/secretCrypto (same as ai_api_key);
-- the controller masks them and never returns raw values to clients.
alter table settings add column if not exists meta_access_token text not null default '';   -- Page access token (leads_retrieval)
alter table settings add column if not exists meta_page_id text not null default '';
alter table settings add column if not exists meta_graph_version text not null default 'v21.0';
alter table settings add column if not exists meta_last_synced_at timestamptz;               -- global display only
alter table settings add column if not exists whatsapp_access_token text not null default ''; -- may equal the Meta token
alter table settings add column if not exists whatsapp_phone_number_id text not null default '';
alter table settings add column if not exists whatsapp_template_name text not null default '';

-- The backend seeds the single settings row (with sensible default departments
-- and locations) on first read, so no INSERT is required here.

-- ---------------------------------------------------------------------------
--  audit_log — accountability trail (who did what). No FK to users so entries
--  survive even if the actor is later deleted.
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text not null,        -- e.g. 'user.create', 'candidate.delete', 'settings.ai_key.update'
  entity_type text,                 -- user | candidate | job | settings | auth
  entity_id   text,
  summary     text,                 -- human-readable one-liner
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on audit_log(created_at desc);
create index if not exists audit_log_action_idx on audit_log(action);
create index if not exists audit_log_entity_idx on audit_log(entity_type);
