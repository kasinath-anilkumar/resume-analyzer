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
  static detectProvider(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return null;
    const key = apiKey.trim();
    if (key.startsWith('sk-ant-')) return 'claude';
    if (key.startsWith('nvapi-')) return 'nvidia';
    if (key.startsWith('AIza')) return 'gemini';
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
      e = new Error(`The ${provider} API quota/rate limit was exceeded. Try again later or use a different key.`);
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
        await axios.get(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
          { timeout }
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

    // 4) Call the provider; propagate a classified error on failure (no fallback).
    try {
      if (provider === 'openai') return await this.analyzeWithOpenAI(resumeText, job, apiKey);
      if (provider === 'claude') return await this.analyzeWithClaude(resumeText, job, apiKey);
      if (provider === 'gemini') return await this.analyzeWithGemini(resumeText, job, apiKey);
      if (provider === 'nvidia') return await this.analyzeWithNvidia(resumeText, job, apiKey);
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
    try {
      let jsonText;
      if (provider === 'openai') {
        const r = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
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
            model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct',
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
            model: 'claude-opus-4-8',
            max_tokens: 2000,
            system: systemPrompt + '\nRespond ONLY with the JSON object. Do not include markdown codeblocks.',
            messages: [{ role: 'user', content: userPrompt }],
          },
          { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
        );
        jsonText = r.data.content[0].text;
      } else if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const r = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
          },
          { headers: { 'Content-Type': 'application/json' } }
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
  static async analyzeWithOpenAI(resumeText, job, apiKey = process.env.OPENAI_API_KEY) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
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
  static async analyzeWithNvidia(resumeText, job, apiKey = process.env.NVIDIA_API_KEY) {
    const response = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        // Override via NVIDIA_NIM_MODEL if your account exposes a different model.
        model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct',
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
  static async analyzeWithClaude(resumeText, job, apiKey = process.env.CLAUDE_API_KEY) {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        // Current Anthropic model. Note: newer Claude models reject the
        // `temperature` parameter (400), so it is intentionally omitted here.
        model: 'claude-opus-4-8',
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
  static async analyzeWithGemini(resumeText, job, apiKey = process.env.GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
          'Content-Type': 'application/json'
        }
      }
    );

    const jsonText = response.data.candidates[0].content.parts[0].text;
    return this.extractJson(jsonText);
  }
}

module.exports = AIService;
