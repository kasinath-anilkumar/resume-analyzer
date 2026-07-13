# Deployment — Backend on Render, Frontend on Vercel

The app is split into two deployables:

- **backend/** → Render (Node web service)
- **frontend/** → Vercel (Vite static site)

Data + resume storage live in **Supabase** (already set up). Deploy the backend
first so you have its URL for the frontend.

---

## 0. Prerequisites

- Code pushed to a GitHub repo (Render and Vercel both deploy from Git).
- Supabase project with the schema applied (`backend/db/schema.sql` — run once
  via `npm run db:migrate` or the Supabase SQL Editor) and an admin seeded
  (`npm run seed:admin`).
- `.env` is **not** committed (it's gitignored) — you'll re-enter these values as
  environment variables in each dashboard.

---

## 1. Backend → Render

1. Render dashboard → **New → Web Service** → connect your repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/`
   - (Or use the included `render.yaml` via **New → Blueprint**.)
3. **Environment variables** (Environment tab):

   | Key | Value |
   |-----|-------|
   | `JWT_SECRET` | a long random string (same one you use locally is fine) |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service-role key |
   | `SUPABASE_BUCKET` | `resume` |
   | `CLIENT_URL` | your Vercel URL (add after step 2, e.g. `https://your-app.vercel.app`) |
   | `AI_PROVIDER` | `mock` (or a provider) |
   | `OPENAI_API_KEY` / `CLAUDE_API_KEY` / `GEMINI_API_KEY` / `NVIDIA_API_KEY` | optional |
   | `NODE_VERSION` | `20` |

   > Do **not** set `PORT` — Render provides it and the server reads it automatically.
   > `DATABASE_URL` is **not** needed at runtime (only for `npm run db:migrate`).

4. Deploy. Note the service URL, e.g. `https://parakkat-ats-api.onrender.com`.
   Test it: opening that URL should return `{"message":"Enterprise ATS API is running..."}`.

---

## 2. Frontend → Vercel

1. Vercel → **Add New → Project** → import your repo.
2. Settings:
   - **Root Directory:** `frontend`
   - Framework preset **Vite** is auto-detected (build `npm run build`, output `dist`).
   - `frontend/vercel.json` already handles SPA routing (deep links / refresh).
3. **Environment variable:**

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | your Render backend URL **without** a trailing `/api`, e.g. `https://parakkat-ats-api.onrender.com` |

   > The frontend appends `/api` itself. So set the origin only.

4. Deploy. Note the production URL, e.g. `https://your-app.vercel.app`.

---

## 3. Connect the two (CORS)

1. Back in Render, set `CLIENT_URL` to your Vercel production URL and redeploy
   (or just save — Render redeploys on env change).
   - Vercel **preview** deployments (`*.vercel.app`) are already allowed by the
     backend's CORS rule, so you only need the production URL here.
2. Open the Vercel URL, log in with your seeded admin, and confirm data loads.

---

## Notes / gotchas

- **Render free tier sleeps** after ~15 min idle; the first request then takes
  ~30–60s to wake (cold start). Upgrade the plan to avoid this.
- **Resume files** go to Supabase Storage (bucket `resume`, must be **public**),
  so Render's ephemeral disk is fine — nothing important is written locally.
- **Changing the DB schema later:** edit `backend/db/schema.sql` and run
  `npm run db:migrate` locally against `DATABASE_URL` (Render doesn't run this).
- **New env vars** require a redeploy to take effect on both platforms.
- If you add a **custom domain** on Vercel, add it to `CLIENT_URL` on Render
  (comma-separated for multiple origins).
