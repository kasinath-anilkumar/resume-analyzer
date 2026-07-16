# WhatsApp Lead Automation — Setup Guide

This wires up the full loop: **Meta ad / sheet → lead created → WhatsApp asks for the
résumé → candidate replies with the file → it's auto-attached to that candidate and
analyzed.**

The code is already built. Nothing runs until the steps below are done, because the
integration self-disables when unconfigured.

There are **two intake paths** (both feed the same pipeline):
- **Auto:** Meta Lead Ads are polled every ~5 min (see the Integrations panel).
- **Manual:** **Upload → "Import leads from a sheet"** — upload a `.csv` of leads.

And the **résumé can come back two ways** (both work at once):
- **Reply in chat** with the file → the inbound webhook attaches it (this guide's focus).
- **Tap the link** in the WhatsApp message → upload page (works without app review).

---

## 1. Prerequisites (on Meta's side)

You need a **Meta Business account** with:
1. A **Meta app** (developer.facebook.com → My Apps → Create App → "Business").
2. **WhatsApp** added to the app (App dashboard → Add Product → WhatsApp).
3. A **WhatsApp sender number** (the test number Meta gives you is fine to start).
4. A **permanent access token** — create a **System User** (business.facebook.com →
   Business Settings → System Users), assign the app + WhatsApp asset, and generate a
   token with `whatsapp_business_messaging` + `whatsapp_business_management`. (The temp
   token in the app dashboard expires in 24h — only use it for a first test.)

You'll collect **four values**:

| Value | Where to find it |
|-------|------------------|
| **Access token** | System User token (above) |
| **Phone number ID** | App → WhatsApp → API Setup → "Phone number ID" |
| **App secret** | App → Settings → Basic → "App Secret" |
| **Verify token** | A random string **you invent** (e.g. `openssl rand -hex 16`) — you'll paste the same value into Meta and into Settings |

---

## 2. Create the message template (for first contact)

Because we message the candidate **before** they've written to us, Meta requires a
**pre-approved template**. Create one under App → WhatsApp → Message Templates (or in
WhatsApp Manager):

- **Category:** Utility
- **Body** — must have exactly **three** `{{ }}` variables in this order
  (`{{1}}` name, `{{2}}` job title, `{{3}}` upload link):

  > Hi {{1}}! Thanks for your interest in **{{2}}** at Parakkat Jewels. Please **reply
  > to this message with your résumé** (PDF or Word), or upload it here: {{3}}

  This wording enables **both** return paths — replying with the file *and* the link.

Submit it and wait for **Approved**. Note the **template name** (e.g. `resume_request`).

---

## 3. Enter everything in the app

Go to **Settings → Integrations** (Admin only) → **WhatsApp resume request**:

- **WhatsApp access token** → your System User token
- **Phone number ID** → from API Setup
- **Approved template name** → e.g. `resume_request`
- **Webhook verify token** → the random string you invented
- **App secret** → from App → Settings → Basic

Save. The status should read **"Ready"** (outbound) once token + phone ID + template are set.

---

## 4. Subscribe the inbound webhook

Copy the **Callback URL** shown in that same panel:

```
<your-api-domain>/api/public/whatsapp/webhook
```

In Meta: App → **WhatsApp → Configuration → Webhook → Edit**:
- **Callback URL:** the URL above
- **Verify token:** the same string you entered in Settings
- Click **Verify and save** (Meta calls the URL; a match returns the challenge → verified).
- Under **Webhook fields**, **subscribe to `messages`**.

For a **production** number (not the test number), messaging inbound events requires
**Advanced Access** for `messages` → App Review + Business Verification. The **test
number works immediately** without review, so validate the whole flow there first.

The panel's **"Inbound ready"** badge lights up once the verify token + app secret are saved.

---

## 5. Test the whole loop

1. Add your own WhatsApp number as a recipient on Meta's test number (API Setup → "To").
2. In the app: **Upload → Import leads from a sheet** → pick a job → upload a one-row CSV:
   ```csv
   Name,Email,Phone
   Test Me,test@you.com,<your number in full international form, e.g. 919876543210>
   ```
3. You should receive the template message on WhatsApp.
4. **Reply to it with a PDF résumé.**
5. Within a few seconds you get "Got it… under review", and the candidate in the app now
   has the résumé attached with analysis **queued** (worker scores it).

---

## How matching works (so you can reason about it)

- An inbound file is matched to the **most-recent lead still awaiting a résumé** whose
  phone matches the sender — exact digits first, then last-10-digit suffix (so a stored
  `+91 98765 43210` matches an inbound `919876543210`).
- Only senders who are a known pending lead are ever messaged or stored — unknown numbers
  are ignored.
- Duplicate files are **idempotent**: once a résumé is attached, a second reply won't
  overwrite it or re-queue (paid) analysis.
- The webhook is authenticated by Meta's **`X-Hub-Signature-256` HMAC** (your App Secret);
  forged/unsigned calls are rejected.

## Gotchas

- **`RUN_WORKER` must not be `false`** unless you run a separate `npm run worker` — the
  worker is what analyzes résumés *and* polls Meta leads.
- Leads imported **before** WhatsApp is configured don't get a message retroactively
  (re-import, or send from a configured state).
- The **24-hour window:** our confirmation reply is free-form and only allowed because the
  candidate just messaged us. First contact always needs the approved template.
