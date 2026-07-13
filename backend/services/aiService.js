const axios = require('axios');

class AIService {
  /**
   * Main entrypoint to analyze resume text against job description
   * @param {string} resumeText - Raw text extracted from the CV
   * @param {object} job - Mongoose Job model instance or object
   * @returns {object} Structured candidate analysis matching schema
   */
  /**
   * Detect which LLM provider an API key belongs to, purely from its shape.
   *   - Anthropic Claude keys start with `sk-ant-`
   *   - NVIDIA NIM / build.nvidia.com keys start with `nvapi-`
   *   - Google Gemini (AI Studio) keys start with `AIza`
   *   - OpenAI keys start with `sk-` (incl. `sk-proj-`)
   * Order matters: check `sk-ant-` before the generic `sk-` prefix.
   * @param {string} apiKey
   * @returns {'openai'|'claude'|'gemini'|'nvidia'|null}
   */
  /**
   * Normalize a pasted API key: strip zero-width / non-breaking characters and
   * any wrapping quotes/backticks that sneak in via copy-paste, then trim. A
   * key that visibly starts with "AIza" but is prefixed by an invisible char or
   * a stray quote would otherwise fail the prefix checks below.
   */
  static cleanKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return '';
    return apiKey
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // zero-width + non-breaking spaces
      .trim()
      .replace(/^["'`\s]+|["'`\s]+$/g, '') // wrapping quotes/backticks/space
      .trim();
  }

  static detectProvider(apiKey) {
    const key = this.cleanKey(apiKey);
    if (!key) return null;
    if (key.startsWith('sk-ant-')) return 'claude';
    if (key.startsWith('nvapi-')) return 'nvidia';
    // Google AI Studio (Gemini) keys: classic "AIza..." and the newer "AQ...." format.
    if (key.startsWith('AIza') || key.startsWith('AQ.')) return 'gemini';
    if (key.startsWith('sk-')) return 'openai';
    return null;
  }

  /**
   * Robustly parse a JSON object from an LLM text response. Handles models
   * that wrap output in ```json code fences or add prose around the object.
   */
  static extractJson(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Empty AI response');
    }
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    if (!t.startsWith('{')) {
      const first = t.indexOf('{');
      const last = t.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        t = t.slice(first, last + 1);
      }
    }
    return JSON.parse(t);
  }

  /**
   * Main entrypoint to analyze resume text against job description.
   * @param {string} resumeText
   * @param {object} job
   * @param {object} [aiConfig] - { apiKey, provider } resolved from Settings.
   *   When a configured key is present it takes priority over env vars.
   */
  static get SUPPORTED_PROVIDERS() {
    return ['openai', 'claude', 'gemini', 'nvidia'];
  }

  // Current Gemini model. The 1.5 models were retired on the Gemini API, so this
  // defaults to a 2.x flash model. Override with GEMINI_MODEL if your key/project
  // exposes a different one (see the models endpoint for what's available).
  static geminiModel() {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  // Does a model id plausibly belong to a provider? Used to guard against a
  // stale stored model from a different provider (e.g. an NVIDIA key left with a
  // 'gemini-*' model) silently breaking analysis.
  static modelMatchesProvider(provider, model) {
    if (!model) return false;
    const m = String(model).toLowerCase();
    switch (provider) {
      case 'gemini': return m.startsWith('gemini') || m.startsWith('gemma');
      case 'openai': return m.startsWith('gpt') || /^o[134]/.test(m);
      case 'claude': return m.startsWith('claude');
      case 'nvidia': return m.includes('/'); // e.g. meta/llama-3.1-70b-instruct
      default: return false;
    }
  }

  // Resolve the model to use: the configured one if it matches the provider,
  // otherwise the provider's default.
  static resolveModel(provider, model) {
    return model && this.modelMatchesProvider(provider, model) ? model : this.defaultModel(provider);
  }

  // The model to use when the admin hasn't explicitly picked one in Settings.
  static defaultModel(provider) {
    switch (provider) {
      case 'openai': return process.env.OPENAI_MODEL || 'gpt-4o-mini';
      case 'claude': return process.env.CLAUDE_MODEL || 'claude-opus-4-8';
      case 'gemini': return this.geminiModel();
      case 'nvidia': return process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct';
      default: return '';
    }
  }

  /**
   * List the models a given key can use for the provider, so the UI can offer a
   * picker. Returns an array of model-id strings (may be empty). Throws a
   * classified error if the key is rejected.
   */
  // Keep only models that can actually do our task: text in → text/JSON out.
  // Drops image / audio / TTS / video / music / embedding / vision-cutout /
  // robotics / computer-use / moderation etc. that a chat/generateContent call
  // with JSON output can't use.
  static filterUsableModels(provider, ids) {
    const EXCLUDE = {
      gemini: /image|imagen|nano-banana|tts|audio|speech|embedding|aqa|veo|lyria|music|robotics|computer-use|vision-only/i,
      openai: /audio|realtime|image|tts|whisper|dall|embedding|moderation|transcribe|search|codex|clip/i,
      nvidia: /embed|rerank|rank|vision|guard|safety|ocr|retriev|reward|parakeet|riva|clip|florence|paddle|nemoretriever/i,
      claude: null,
    }[provider];
    const seen = new Set();
    return (ids || [])
      .filter((id) => id && (!EXCLUDE || !EXCLUDE.test(id)))
      .filter((id) => (seen.has(id) ? false : seen.add(id)));
  }

  static async listModels(apiKey, provider) {
    const timeout = 12000;
    try {
      let ids = [];
      if (provider === 'openai') {
        const r = await axios.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` }, timeout,
        });
        ids = (r.data.data || []).map((m) => m.id).filter((id) => /gpt|^o1|^o3|^o4/i.test(id)).sort();
      } else if (provider === 'claude') {
        const r = await axios.get('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, timeout,
        });
        ids = (r.data.data || []).map((m) => m.id);
      } else if (provider === 'gemini') {
        const r = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: { 'x-goog-api-key': apiKey }, timeout,
        });
        ids = (r.data.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => String(m.name || '').replace(/^models\//, ''))
          .filter(Boolean);
      } else if (provider === 'nvidia') {
        const r = await axios.get('https://integrate.api.nvidia.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` }, timeout,
        });
        ids = (r.data.data || []).map((m) => m.id).sort();
      }
      return this.filterUsableModels(provider, ids);
    } catch (error) {
      if (error.aiClassified) throw error;
      throw this.providerError(error, provider);
    }
  }

  // Thrown when no usable AI key/provider is configured anywhere.
  static notConfiguredError() {
    const e = new Error(
      'Resume analysis is unavailable: no valid AI API key is configured. An administrator must add a working API key in Settings before resumes can be analyzed.'
    );
    e.status = 503;
    e.code = 'AI_NOT_CONFIGURED';
    e.aiClassified = true;
    return e;
  }

  // Classify a provider failure into a clear, user-facing error.
  static providerError(error, provider) {
    const status = error.response?.status;
    const apiMsg =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message;
    let e;
    if (status === 401 || status === 403 || (status === 400 && /api[\s_-]?key|invalid|unauthor|permission/i.test(apiMsg))) {
      e = new Error(`The ${provider} API key is invalid or unauthorized. Update it in Settings and try again.`);
      e.status = 400;
      e.code = 'AI_KEY_INVALID';
    } else if (status === 429) {
      // Surface Google's own explanation (first line) — it distinguishes a
      // real rate-limit from a model with zero free-tier quota (limit: 0).
      const firstLine = (apiMsg || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
      const zeroQuota = /limit:\s*0\b/i.test(apiMsg || '');
      const geminiHint =
        provider === 'gemini'
          ? zeroQuota
            ? ' This model has no free-tier quota (Pro/preview models usually require billing). In Settings, switch the AI Model to a Flash model like gemini-2.0-flash or gemini-2.5-flash.'
            : ' Wait a moment and retry, or in Settings switch to a Flash model (gemini-2.0-flash / gemini-2.5-flash) which has higher free limits.'
          : ' Try again later or use a key with higher quota.';
      e = new Error(`The ${provider} API quota was exceeded${firstLine ? ` (${firstLine})` : ''}.${geminiHint}`);
      e.status = 429;
      e.code = 'AI_RATE_LIMIT';
    } else {
      e = new Error(`AI analysis failed via ${provider}: ${apiMsg}`);
      e.status = 502;
      e.code = 'AI_FAILED';
    }
    e.aiClassified = true;
    return e;
  }

  /**
   * Live-check that an API key actually works by hitting the provider's cheap
   * model-list endpoint (no token cost). Returns true, or throws a classified
   * error (invalid key / rate limit / unreachable). Used at settings save-time
   * so admins get immediate feedback instead of every upload failing later.
   */
  static async validateKey(apiKey, provider) {
    const timeout = 12000;
    try {
      if (provider === 'openai') {
        await axios.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` }, timeout,
        });
        return true;
      }
      if (provider === 'claude') {
        await axios.get('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, timeout,
        });
        return true;
      }
      if (provider === 'gemini') {
        // Authenticate via the x-goog-api-key header only — it works for both the
        // classic AIza keys and the newer AQ. format (the ?key= query param can
        // reject the new format).
        await axios.get(
          'https://generativelanguage.googleapis.com/v1beta/models',
          { timeout, headers: { 'x-goog-api-key': apiKey } }
        );
        return true;
      }
      if (provider === 'nvidia') {
        // NVIDIA's /models endpoint doesn't require auth, so it can't validate a
        // key. Probe with a 1-token completion instead — a bogus key returns 401.
        await axios.post(
          'https://integrate.api.nvidia.com/v1/chat/completions',
          {
            model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout }
        );
        return true;
      }
      throw this.notConfiguredError();
    } catch (error) {
      if (error.aiClassified) throw error; // already a friendly, classified error
      throw this.providerError(error, provider);
    }
  }

  /**
   * Analyze a resume against a job. REQUIRES a valid, working AI provider key —
   * there is no mock/heuristic fallback. If no key is configured, or the
   * provider rejects the request, this throws a classified error (with `.status`
   * and `.code`) so the caller can surface it and abort without saving anything.
   */
  /**
   * Resolve the {apiKey, provider} pair to use for any AI call. Prefers a key
   * configured through the app (Settings, provider auto-detected from the key
   * shape), then falls back to environment configuration. Throws the
   * `notConfiguredError` if nothing usable is found. Shared by every AI feature
   * (resume analysis, job-poster extraction, ...).
   */
  static resolveKeyProvider(aiConfig = {}) {
    // 1) Prefer a key configured through the app (Settings); auto-detect its provider.
    let apiKey = aiConfig.apiKey && aiConfig.apiKey.trim() ? aiConfig.apiKey.trim() : null;
    let provider = apiKey
      ? this.detectProvider(apiKey) ||
        (aiConfig.provider && aiConfig.provider !== 'mock' ? aiConfig.provider : null)
      : null;

    // 2) Fall back to environment configuration if no app key is set.
    if (!apiKey) {
      const envProvider = (process.env.AI_PROVIDER || '').toLowerCase();
      if (envProvider === 'openai' && process.env.OPENAI_API_KEY) {
        provider = 'openai';
        apiKey = process.env.OPENAI_API_KEY;
      } else if (envProvider === 'claude' && process.env.CLAUDE_API_KEY) {
        provider = 'claude';
        apiKey = process.env.CLAUDE_API_KEY;
      } else if (envProvider === 'gemini' && process.env.GEMINI_API_KEY) {
        provider = 'gemini';
        apiKey = process.env.GEMINI_API_KEY;
      } else if (envProvider === 'nvidia' && process.env.NVIDIA_API_KEY) {
        provider = 'nvidia';
        apiKey = process.env.NVIDIA_API_KEY;
      }
    }

    // 3) No usable, recognized provider -> hard stop.
    if (!apiKey || !provider || !this.SUPPORTED_PROVIDERS.includes(provider)) {
      throw this.notConfiguredError();
    }

    return { apiKey, provider };
  }

  static async analyzeResume(resumeText, job, aiConfig = {}) {
    const { apiKey, provider } = this.resolveKeyProvider(aiConfig);
    const model = this.resolveModel(provider, aiConfig.model && aiConfig.model.trim());

    // 4) Call the provider; propagate a classified error on failure (no fallback).
    try {
      if (provider === 'openai') return await this.analyzeWithOpenAI(resumeText, job, apiKey, model);
      if (provider === 'claude') return await this.analyzeWithClaude(resumeText, job, apiKey, model);
      if (provider === 'gemini') return await this.analyzeWithGemini(resumeText, job, apiKey, model);
      if (provider === 'nvidia') return await this.analyzeWithNvidia(resumeText, job, apiKey, model);
      throw this.notConfiguredError();
    } catch (error) {
      if (error.aiClassified) throw error; // already a friendly, classified error
      console.error(`AI analysis failed with provider ${provider}:`, error.message);
      throw this.providerError(error, provider);
    }
  }

  /**
   * Generic single-turn "return one JSON object" completion, dispatched to the
   * configured provider. Used by non-resume AI features (e.g. extracting a job
   * posting from a hiring poster). Returns the parsed JSON object or throws a
   * classified error.
   */
  static async completeJson(systemPrompt, userPrompt, aiConfig = {}) {
    const { apiKey, provider } = this.resolveKeyProvider(aiConfig);
    const model = this.resolveModel(provider, aiConfig.model && aiConfig.model.trim());
    try {
      let jsonText;
      if (provider === 'openai') {
        const r = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
        );
        jsonText = r.data.choices[0].message.content;
      } else if (provider === 'nvidia') {
        const r = await axios.post(
          'https://integrate.api.nvidia.com/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            max_tokens: 2000,
          },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
        );
        jsonText = r.data.choices[0].message.content;
      } else if (provider === 'claude') {
        const r = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model,
            max_tokens: 2000,
            system: systemPrompt + '\nRespond ONLY with the JSON object. Do not include markdown codeblocks.',
            messages: [{ role: 'user', content: userPrompt }],
          },
          { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
        );
        jsonText = r.data.content[0].text;
      } else if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const r = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
          },
          { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } }
        );
        jsonText = r.data.candidates[0].content.parts[0].text;
      } else {
        throw this.notConfiguredError();
      }
      return this.extractJson(jsonText);
    } catch (error) {
      if (error.aiClassified) throw error;
      console.error(`AI JSON completion failed with provider ${provider}:`, error.message);
      throw this.providerError(error, provider);
    }
  }

  /**
   * Extract a structured job posting from the text of a hiring poster/flyer
   * (already OCR'd from the uploaded image). Returns fields ready to prefill the
   * "Create New Job" form. Does NOT persist anything — the recruiter reviews and
   * submits. Throws a classified error if AI is unavailable or fails.
   */
  static async extractJobFromText(posterText, aiConfig = {}) {
    if (!posterText || !posterText.replace(/\s/g, '').length) {
      const e = new Error('Could not read any text from the poster. Try a clearer image.');
      e.status = 422;
      e.code = 'POSTER_EMPTY';
      e.aiClassified = true;
      throw e;
    }

    const systemPrompt = `You are an expert recruiting assistant. You are given the raw text extracted (via OCR) from a hiring poster, flyer, or job advertisement image. Extract a structured job posting from it.

You MUST respond with a single valid JSON object (no markdown code fences) with EXACTLY this schema:
{
  "title": "Job title/role, e.g. 'Senior Sales Associate'",
  "department": "Department or team, e.g. 'Sales', 'Engineering'. Infer if not explicit; empty string if unknown.",
  "location": "Job location (city / branch / Remote). Empty string if unknown.",
  "employmentType": "One of exactly: 'Full-time', 'Part-time', 'Contract', 'Internship', 'Remote'. Default 'Full-time' if unclear.",
  "salaryRange": "Salary/compensation as written, e.g. '₹25,000 - ₹35,000 / month'. Empty string if not mentioned.",
  "experience": "Experience requirement as written, e.g. '2+ Years', 'Freshers', 'Mid-Senior level'. Empty string if unknown.",
  "numberOpenings": 1,
  "requiredSkills": ["Array of must-have skills/qualifications explicitly required"],
  "preferredSkills": ["Array of nice-to-have / preferred skills; empty array if none"],
  "description": "A clean, well-written job description paragraph summarizing the role, responsibilities, and requirements based on the poster. Do NOT invent facts not present in the poster."
}

Rules:
- Extract only information present in the poster text. Do not fabricate specific facts (salary, location, contact) that are not there — use an empty string instead.
- It is OK to write a fluent 'description' that organizes and lightly expands the poster's own content, but stay faithful to it.
- 'numberOpenings' must be an integer >= 1 (use 1 if not specified).
- 'employmentType' MUST be one of the five allowed values exactly.`;

    const userPrompt = `HIRING POSTER TEXT (OCR):
----------------------------------------
${posterText}
----------------------------------------

Extract the job posting and return the required JSON object.`;

    const raw = await this.completeJson(systemPrompt, userPrompt, aiConfig);
    return this.normalizeExtractedJob(raw);
  }

  // Coerce an LLM job-extraction result into safe, schema-valid shape.
  static normalizeExtractedJob(raw = {}) {
    const allowedTypes = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Remote'];
    const toArray = (v) => {
      if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
      if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
      return [];
    };
    const str = (v) => (v == null ? '' : String(v).trim());
    let openings = parseInt(raw.numberOpenings, 10);
    if (!Number.isFinite(openings) || openings < 1) openings = 1;
    let employmentType = str(raw.employmentType);
    if (!allowedTypes.includes(employmentType)) employmentType = 'Full-time';

    return {
      title: str(raw.title),
      department: str(raw.department),
      location: str(raw.location),
      employmentType,
      salaryRange: str(raw.salaryRange),
      experience: str(raw.experience),
      numberOpenings: openings,
      requiredSkills: toArray(raw.requiredSkills),
      preferredSkills: toArray(raw.preferredSkills),
      description: str(raw.description),
    };
  }

  static getSystemPrompt() {
    return `You are an expert AI recruiting and resume parsing assistant for an enterprise Applicant Tracking System (ATS).
Your task is to parse candidate resumes and analyze them against a specific Job Description.

You MUST respond with a single valid JSON object. Do NOT wrap the JSON in markdown code blocks like \`\`\`json.
The JSON output must strictly adhere to this schema:
{
  "name": "Candidate Full Name (extract from text)",
  "email": "Candidate Email (extract from text)",
  "phone": "Candidate Phone Number (extract from text)",
  "githubUrl": "GitHub Profile URL or empty string",
  "linkedInUrl": "LinkedIn Profile URL or empty string",
  "portfolioUrl": "Portfolio Website URL or empty string",
  "skills": ["Array of all skills found on the resume"],
  "certifications": ["Array of certifications found on the resume"],
  "languages": ["Array of languages found on the resume"],
  "education": [
    {
      "school": "Name of school/university",
      "degree": "Degree earned, e.g., Bachelor of Science",
      "fieldOfStudy": "Major/Field of Study",
      "startYear": "Start year (YYYY)",
      "endYear": "End year (YYYY) or 'Present'"
    }
  ],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "location": "Location (City, State, Remote, etc.)",
      "startDate": "Start date (Month YYYY)",
      "endDate": "End date (Month YYYY) or 'Present'",
      "description": "Short summary of responsibilities and achievements"
    }
  ],
  "projects": [
    {
      "title": "Project Title",
      "description": "Description of project, tech stack used, outcomes",
      "link": "Project link or empty string"
    }
  ],
  "aiAnalysis": {
    "overallScore": 85, // Integer 0-100
    "technicalScore": 90, // Integer 0-100
    "experienceScore": 80, // Integer 0-100
    "educationScore": 75, // Integer 0-100
    "communicationScore": 85, // Integer 0-100
    "cultureFitScore": 90, // Integer 0-100
    "explanations": {
      "overall": "Explanation of the overall score...",
      "technical": "Explanation of technical alignment...",
      "experience": "Explanation of experience depth...",
      "education": "Explanation of educational pedigree...",
      "communication": "Explanation of written communication and layout quality...",
      "cultureFit": "Explanation of potential culture fit based on background..."
    },
    "strengths": ["Strength 1", "Strength 2"],
    "weaknesses": ["Weakness 1", "Weakness 2"],
    "missingSkills": ["List of skills requested in the job description but missing in the resume"],
    "careerSummary": "Professional summary of the candidate's career...",
    "recommendation": "Short recommendation statement (e.g. 'Strong Hire', 'Proceed to Interview', 'Reject')",
    "matchedSkills": ["List of skills requested in the job description that the candidate HAS"],
    "matchPercentage": 82, // Integer 0-100 representing job alignment
    "matchExplanation": "Detailed explanation of why the candidate matches or doesn't match the job requirements..."
  }
}

IMPORTANT — LINKS: The resume text may end with a section labelled "[DETECTED LINKS]" listing hyperlink URLs harvested directly from the document's metadata. Treat those URLs as authoritative and prefer them when filling githubUrl, linkedInUrl, portfolioUrl and project links. Classify them:
- a github.com URL -> githubUrl
- a linkedin.com URL -> linkedInUrl
- a personal site / vercel / netlify / behance / dribbble / medium / dev.to / a repo-specific link -> portfolioUrl or the relevant project's link
- ignore mailto: links for these URL fields (the email already has its own field)
Never invent URLs that are not present in the text.`;
  }

  static getUserPrompt(resumeText, job) {
    return `JOB DESCRIPTION:
Title: ${job.title}
Department: ${job.department}
Location: ${job.location}
Employment Type: ${job.employmentType}
Experience Required: ${job.experience}
Required Skills: ${job.requiredSkills.join(', ')}
Preferred Skills: ${job.preferredSkills ? job.preferredSkills.join(', ') : 'None'}
Description: ${job.description}

CANDIDATE RESUME TEXT:
----------------------------------------
${resumeText}
----------------------------------------

Analyze the resume text, extract all fields, compute scores out of 100, and return the required JSON object.`;
  }

  // --- OpenAI Provider ---
  static async analyzeWithOpenAI(resumeText, job, apiKey = process.env.OPENAI_API_KEY, model) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: model || this.defaultModel('openai'),
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: this.getUserPrompt(resumeText, job) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const jsonText = response.data.choices[0].message.content;
    return this.extractJson(jsonText);
  }

  // --- NVIDIA NIM Provider (OpenAI-compatible endpoint) ---
  static async analyzeWithNvidia(resumeText, job, apiKey = process.env.NVIDIA_API_KEY, model) {
    const response = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        model: model || this.defaultModel('nvidia'),
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: this.getUserPrompt(resumeText, job) }
        ],
        temperature: 0.1,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const jsonText = response.data.choices[0].message.content;
    return this.extractJson(jsonText);
  }

  // --- Claude Provider ---
  static async analyzeWithClaude(resumeText, job, apiKey = process.env.CLAUDE_API_KEY, model) {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        // Note: newer Claude models reject the `temperature` parameter (400),
        // so it is intentionally omitted here.
        model: model || this.defaultModel('claude'),
        max_tokens: 4000,
        system: this.getSystemPrompt() + '\nRespond ONLY with the JSON object. Do not include markdown codeblocks.',
        messages: [
          { role: 'user', content: this.getUserPrompt(resumeText, job) }
        ]
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      }
    );

    const jsonText = response.data.content[0].text;
    return this.extractJson(jsonText);
  }

  // --- Gemini Provider ---
  static async analyzeWithGemini(resumeText, job, apiKey = process.env.GEMINI_API_KEY, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || this.defaultModel('gemini')}:generateContent`;

    const promptText = `${this.getSystemPrompt()}\n\n${this.getUserPrompt(resumeText, job)}`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [{ text: promptText }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        }
      }
    );

    const jsonText = response.data.candidates[0].content.parts[0].text;
    return this.extractJson(jsonText);
  }
}

module.exports = AIService;
