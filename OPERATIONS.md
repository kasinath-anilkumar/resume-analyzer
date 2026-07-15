# Operations & Scaling Checklist (50+ branches)

Prioritized actions to run this app reliably and securely at scale. **P0** = do
before/at 50-branch load; **P1** = soon; **P2** = when convenient. Items marked
_(code done)_ are already handled in the app — the action is yours (config/ops).

---

## P0 — Provisioning & the two biggest risks

### 1. Move off the free tier (server load)
The free Render instance sleeps (30–50 s cold starts), caps at 512 MB, and runs
the web server **and** the OCR/AI worker in one process. For 50 branches:
- [ ] **Paid, always-on** web instance, **≥1 GB RAM** (OCR of large scanned PDFs is
      memory-heavy). Start at 1–2 GB and watch memory.
- [ ] Run the **analysis worker as a separate Render Background Worker** so OCR/AI
      spikes can't starve live web requests. A standalone worker entrypoint
      (`npm run worker`, with `RUN_WORKER=false` to disable it on the web tier) is
      provided — deploy it as a second Render service pointed at the same DB.
- [ ] Enable **Postgres backups** (Supabase daily backups / PITR) and confirm the
      storage bucket is backed up or reproducible.

### 2. Set a dedicated encryption key (security) _(code done)_
Stored provider tokens (AI/Meta/WhatsApp) are encrypted at rest, but the key
defaults to `JWT_SECRET` if `SETTINGS_ENC_KEY` is unset — so one leaked auth
secret could also decrypt them.
- [ ] Set a **distinct random `SETTINGS_ENC_KEY`** (32+ random chars) in the
      backend env. Decryption falls back to `JWT_SECRET` automatically, so nothing
      breaks.
- [ ] Run **`npm run reencrypt-secrets`** once to upgrade stored secrets to the new
      key, then you can retire the fallback.

### 3. Rotate & protect the Supabase service-role key (security)
RLS is disabled; this key is the only guard on all candidate PII.
- [ ] **Rotate `SUPABASE_SERVICE_ROLE_KEY`** (it briefly lived in a tracked
      `.env.example` historically) and update the backend env.
- [ ] Confirm it is **never** in the frontend bundle (it isn't — not `VITE_`-
      prefixed), logs, or error responses.
- [ ] Limit who has production env access.

---

## P1 — Soon

### 4. Rate-limit store for multiple instances _(code done for single instance)_
Auth limiting is now two-layer (per-IP flood cap + per-account cap) so a branch
behind one NAT isn't locked out. The store is in-memory (per-instance).
- [ ] If you scale the **web tier to >1 instance**, add a shared store
      (Upstash/Redis or a Postgres store) so limits are enforced fleet-wide.

### 5. Meta lead poll: single-writer _(code done — polling is per-instance)_
- [ ] If >1 instance runs the poll, add a DB claim-lock (like the analysis queue's
      `claimNextPending`) so leads aren't fetched twice. With a single background
      worker this is already fine.

### 6. Data retention (DB growth + GDPR)
Retention is **off by default**, so candidate rows (and résumé files) accumulate
unbounded — the main driver of DB size at 50 branches.
- [ ] Set **Settings → Data & Privacy → retention days** to a sane window (e.g.
      365) so old, non-hired candidates + their résumés are auto-purged.

### 7. JWT lifetime
Access tokens last 30 days. Deleting a user or changing their role takes effect
immediately (the server re-checks each request), but a leaked token stays valid.
- [ ] Consider a shorter access token + refresh flow if the threat model warrants.

---

## P2 — When convenient

- [ ] **Put a CDN/WAF in front** (Cloudflare) — real DDoS/credential-stuffing
      defense, plus caching for the frontend.
- [ ] **RLS as defense-in-depth** — enable Row Level Security with policies so a
      backend bug can't expose all rows even with the service key. (Larger project.)
- [ ] **Malware scanning** on public résumé uploads (`/public/apply`,
      `/public/lead/:token/resume`).
- [ ] **Front-end code-splitting** — the SPA ships one ~1.3 MB JS chunk; lazy-load
      routes for faster loads across branches.
- [ ] **Notifications polling** — the dashboard polls every 45 s per open tab;
      lengthen or switch to server-sent events at high user counts.

---

## Already shipped in code (no action needed)
- SQL-side candidate list pagination + search (no more whole-table scans).
- "Deleted mid-analysis" guard (no wasted AI credit when a candidate is trashed
  while being analyzed).
- Encrypted-at-rest provider tokens with safe key rotation.
- Two-layer auth rate limiting (branch-safe + brute-force-safe).
- Prompt-injection defense on résumé text; audit log for accountability.
