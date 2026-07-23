# Deployment — Backend on Render, Frontend on Vercel

The app is split into two deployables:

- **backend/** → Render (Node web service)
- **frontend/** → Vercel (Vite static site)

Data + résumé storage live in **Supabase**. Deploy the backend first so you have
its URL for the frontend, then come back and set `CLIENT_URL`/`APP_URL`.

---

## 0. Prerequisites

- Code pushed to GitHub (Render and Vercel both deploy from Git).
- Supabase project with the schema applied and an admin seeded:
  ```bash
  cd backend
  npm run db:migrate     # applies db/schema.sql, including the RLS lockdown
  npm run seed:admin
  ```
- `.env` is **not** committed (gitignored) — you re-enter these values as
  environment variables in each dashboard.

### Security steps that are NOT environment variables

Both of these are easy to miss and neither is enforced by code:

1. **Run the migration.** `db/schema.sql` ends with a ROW LEVEL SECURITY section
   that enables RLS on every table and revokes the `anon`/`authenticated`
   grants. Until it runs, Supabase's *publishable* anon key has full read/write
   on every table — candidates, applicants, users, settings, audit log —
   bypassing the app's auth entirely. The backend uses the service-role key,
   which bypasses RLS, so nothing in the app changes.
2. **Set the `resume` storage bucket to PRIVATE** (Supabase → Storage → bucket →
   Public = off). Résumés are PII. The app never hands out a permanent object
   URL; it mints short-lived signed URLs behind authenticated, ownership-checked
   endpoints. A public bucket makes every résumé directly downloadable by URL.

---

## 1. Backend → Render

1. Render dashboard → **New → Blueprint** and point it at this repo (uses the
   included `render.yaml`), or **New → Web Service** with these settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`

2. **Environment variables** (Environment tab):

   | Key | Value | |
   |-----|-------|---|
   | `NODE_ENV` | `production` | **required** |
   | `JWT_SECRET` | **a NEW random string** — `openssl rand -base64 48` | **required** |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` | **required** |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service-role key | **required** |
   | `SUPABASE_BUCKET` | `resume` | **required** |
   | `CLIENT_URL` | your Vercel URL (set in step 3) | **required** |
   | `APP_URL` | your Vercel URL (set in step 3) | **required** |
   | `SETTINGS_ENC_KEY` | a second random string | recommended |
   | `RESEND_API_KEY` | your Resend key | recommended |
   | `EMAIL_FROM` | verified sender on your domain | recommended |
   | `ALLOW_VERCEL_PREVIEWS` | `false` | recommended |
   | `NODE_VERSION` | `20` | |
   | `AI_PROVIDER` + a key | optional — normally set in-app instead | |

   > **The server refuses to start** if `NODE_ENV=production` and either
   > `CLIENT_URL` or `APP_URL` is blank. That is deliberate: blank used to fail
   > silently in the browser (CORS) and in email (dead reset links). If the
   > deploy exits at boot, read the log — it names the missing variable.

   > Do **not** set `PORT` (Render provides it), `DATABASE_URL` (only needed
   > locally for `db:migrate`), or `ADMIN_*` (only read by `seed:admin` — it
   > would leave a plaintext password in the environment).

   > Generate a **new** `JWT_SECRET` here rather than reusing a local one. It
   > signs every staff and applicant session; anyone who knows it can forge an
   > Admin login.

3. Deploy. Note the service URL, e.g. `https://parakkat-ats-api.onrender.com`.
   Check it: `GET /api/health` should return JSON with `"ok": true` (it reports
   real database reachability).

---

## 2. Frontend → Vercel

1. Vercel → **Add New → Project** → import this repo.
2. Settings:
   - **Root Directory:** `frontend`
   - Framework preset **Vite** is auto-detected (build `npm run build`, output `dist`).
   - `frontend/vercel.json` already handles SPA routing (deep links / refresh).
3. **Environment variable:**

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | your Render origin, **no** trailing slash and **no** `/api` — e.g. `https://parakkat-ats-api.onrender.com` |

   > The frontend appends `/api` itself, so set the origin only.

   > **The build fails** if `VITE_API_URL` is unset. Vite inlines it at build
   > time, so an unset value used to ship an app that called `localhost:5000`
   > from the user's browser. Set it *before* the first build; changing it later
   > requires a redeploy, not just an env edit.

4. Deploy. Note the production URL, e.g. `https://parakkat-ats.vercel.app`.

---

## 3. Connect the two (CORS)

1. Back in Render, set **both** `CLIENT_URL` and `APP_URL` to your Vercel
   production URL, then redeploy (saving env vars triggers one).
   - With `ALLOW_VERCEL_PREVIEWS=false`, preview deploys (`*.vercel.app`) are
     **not** trusted — only the exact origins in `CLIENT_URL`. If you want
     previews to work against production, either set that flag to `true`
     (weaker: any `*.vercel.app` site is then trusted) or add specific preview
     URLs to `CLIENT_URL`.
2. Open the Vercel URL, sign in with your seeded admin, confirm data loads.
3. Re-enter the AI key in **Settings → AI** — analysis stays inert until a key
   is configured there (or via the `AI_PROVIDER` env fallback).

---

## Notes / gotchas

- **Render free tier sleeps** after ~15 min idle; the first request then takes
  ~30–60s to wake. It also caps memory at 512 MB, and the in-process worker runs
  OCR (`tesseract.js`) on scanned résumés — a large scan can exhaust that. If you
  see the worker restarting, upgrade the plan or split it into its own service
  (`npm run worker`, with `RUN_WORKER=false` on the web service).
- **Résumé files** go to Supabase Storage, so Render's ephemeral disk is fine —
  nothing important is written locally.
- **Schema changes** are not applied by Render. Edit `backend/db/schema.sql` and
  run `npm run db:migrate` locally against `DATABASE_URL`.
- **New env vars** require a redeploy to take effect on both platforms.
- **Custom domain on Vercel:** add it to `CLIENT_URL` on Render (comma-separated
  for multiple origins) and point `APP_URL` at it.
- **Rate limits are per-instance** (in-memory). If you ever scale Render past one
  instance, swap in a shared store or the limits multiply by instance count.
