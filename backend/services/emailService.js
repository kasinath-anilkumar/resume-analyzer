const axios = require('axios');

/**
 * Transactional email via Resend (https://resend.com) over its REST API — no
 * SDK dependency, matching the app's axios-based providers.
 *
 * Configuration (all optional — if RESEND_API_KEY is absent, every send is a
 * graceful no-op so the app keeps working without email, exactly like the AI
 * key pattern):
 *   RESEND_API_KEY   your Resend API key (re_...)
 *   EMAIL_FROM       verified sender, e.g. "PARAKKAT ATS <hiring@yourdomain.com>"
 *   APP_URL          public frontend URL, used in email links (optional)
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PARAKKAT ATS <onboarding@resend.dev>';

const isConfigured = () => Boolean(RESEND_API_KEY);

// Minimal, safe HTML wrapper for a message body.
const wrap = (title, bodyHtml) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <h2 style="color:#4f46e5;margin:0 0 12px">${title}</h2>
    <div style="font-size:14px;line-height:1.6;color:#334155">${bodyHtml}</div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
    <p style="font-size:11px;color:#94a3b8">Sent by PARAKKAT ATS</p>
  </div>`;

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const EmailService = {
  isConfigured,

  /**
   * Low-level send. Never throws — email must not break the primary request.
   * Returns { sent: boolean, skipped?: string, error?: string }.
   */
  async send({ to, subject, html }) {
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
    if (!recipients.length) return { sent: false, skipped: 'no recipients' };
    if (!isConfigured()) return { sent: false, skipped: 'email not configured' };

    try {
      await axios.post(
        'https://api.resend.com/emails',
        { from: EMAIL_FROM, to: recipients, subject, html },
        {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          timeout: 12000,
        }
      );
      return { sent: true };
    } catch (err) {
      console.error('Email send failed:', err.response?.data || err.message);
      return { sent: false, error: err.response?.data?.message || err.message };
    }
  },

  // Mirror an in-app notification to recipients' inboxes.
  async sendNotification(recipients, { title, message, senderName }) {
    if (!recipients.length) return { sent: false, skipped: 'no recipients' };
    const html = wrap(
      esc(title || 'New notification'),
      `<p>${esc(message)}</p><p style="color:#94a3b8;font-size:12px">— ${esc(senderName || 'Admin')}</p>`
    );
    return this.send({ to: recipients, subject: title ? `[ATS] ${title}` : '[ATS] New notification', html });
  },

  // Interview invite to a candidate.
  async sendInterviewInvite(candidate, interview, jobTitle) {
    if (!candidate?.email) return { sent: false, skipped: 'no candidate email' };
    const when = interview.scheduledAt ? new Date(interview.scheduledAt).toLocaleString() : 'TBD';
    const rows = [
      ['Role', jobTitle],
      ['Stage', interview.stage],
      ['When', when],
      ['Mode', interview.mode],
      [interview.mode === 'Online' ? 'Link' : 'Location', interview.locationOrLink],
      ['Interviewer', interview.interviewer],
    ]
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`
      )
      .join('');
    const html = wrap(
      'Interview Scheduled',
      `<p>Hi ${esc(candidate.name || 'there')},</p>
       <p>You have an interview scheduled. Details:</p>
       <table style="border-collapse:collapse;margin:8px 0">${rows}</table>
       ${interview.notes ? `<p style="color:#475569">${esc(interview.notes)}</p>` : ''}
       <p>Good luck!</p>`
    );
    return this.send({ to: candidate.email, subject: `Interview scheduled — ${jobTitle || 'your application'}`, html });
  },
};

module.exports = EmailService;
