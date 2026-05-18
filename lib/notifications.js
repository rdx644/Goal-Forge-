/**
 * GoalForge — Email & Microsoft Teams Notification Service
 * Section 5.2: Email notifications + Teams webhook integration
 * 
 * Email Setup (SMTP):
 *   Set env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   Example (Gmail): SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=you@gmail.com SMTP_PASS=app-password
 * 
 * Teams Setup:
 *   Set env var: TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
 *   Create incoming webhook in your Teams channel: Channel Settings → Connectors → Incoming Webhook
 */

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587'),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'GoalForge <noreply@goalforge.local>',
};

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function isEmailEnabled() {
  return !!(SMTP_CONFIG.host && SMTP_CONFIG.user && SMTP_CONFIG.pass);
}

function isTeamsEnabled() {
  return !!TEAMS_WEBHOOK_URL;
}

/**
 * Send email notification using SMTP
 * Uses raw Node.js net/tls — no nodemailer dependency needed
 */
async function sendEmail(to, subject, htmlBody) {
  if (!isEmailEnabled()) {
    console.log(`[EMAIL-SKIP] To: ${to} | Subject: ${subject} (SMTP not configured)`);
    return false;
  }

  try {
    // Use dynamic import for nodemailer if available, otherwise log
    let nodemailer;
    try {
      const optionalRequire = eval('require');
      nodemailer = optionalRequire('nodemailer');
    } catch {
      console.log(`[EMAIL-SKIP] nodemailer not installed. Run: npm install nodemailer`);
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      secure: SMTP_CONFIG.port === 465,
      auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
    });

    await transporter.sendMail({
      from: SMTP_CONFIG.from,
      to,
      subject: `[GoalForge] ${subject}`,
      html: wrapEmailTemplate(subject, htmlBody),
    });

    console.log(`[EMAIL-SENT] To: ${to} | Subject: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL-ERROR] To: ${to} | Error: ${err.message}`);
    return false;
  }
}

/**
 * Send Microsoft Teams notification via Incoming Webhook
 * Uses adaptive card format for rich notifications
 */
async function sendTeamsNotification(title, message, link, facts) {
  if (!isTeamsEnabled()) {
    console.log(`[TEAMS-SKIP] ${title}: ${message} (Webhook not configured)`);
    return false;
  }

  try {
    const card = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: `🎯 GoalForge: ${title}`,
              weight: 'Bolder',
              size: 'Medium',
              color: 'Accent',
            },
            {
              type: 'TextBlock',
              text: message,
              wrap: true,
            },
            ...(facts ? [{
              type: 'FactSet',
              facts: facts.map(f => ({ title: f.label, value: f.value })),
            }] : []),
          ],
          actions: link ? [{
            type: 'Action.OpenUrl',
            title: 'Open in GoalForge',
            url: `${APP_URL}${link}`,
          }] : [],
        },
      }],
    };

    const res = await fetch(TEAMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });

    if (!res.ok) {
      throw new Error(`Teams webhook returned ${res.status}`);
    }

    console.log(`[TEAMS-SENT] ${title}`);
    return true;
  } catch (err) {
    console.error(`[TEAMS-ERROR] ${err.message}`);
    return false;
  }
}

/**
 * Unified notification dispatcher — sends in-app + email + Teams
 * Call this instead of directly inserting into notifications table
 */
function dispatchNotification(db, { userId, type, title, message, link, emailTo, teamsFacts }) {
  // 1. In-app notification (always)
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, message, link || null);

  // 2. Email notification (if configured)
  if (emailTo) {
    const deepLink = link ? `<p><a href="${APP_URL}${link}" style="color:#6366f1;font-weight:600;">→ Open in GoalForge</a></p>` : '';
    sendEmail(emailTo, title, `<p>${message}</p>${deepLink}`).catch(() => {});
  }

  // 3. Teams notification (if configured)
  sendTeamsNotification(title, message, link, teamsFacts).catch(() => {});
}

/** Email HTML template wrapper */
function wrapEmailTemplate(subject, body) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:'Segoe UI',Arial,sans-serif;background:#0a0e1a;color:#f1f5f9;padding:40px;">
      <div style="max-width:560px;margin:0 auto;background:#1a2035;border:1px solid #2a3352;border-radius:16px;padding:32px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="display:inline-block;width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:10px;line-height:40px;color:white;font-weight:800;font-size:16px;">GF</span>
          <span style="font-size:22px;font-weight:800;margin-left:10px;vertical-align:middle;">GoalForge</span>
        </div>
        <h2 style="color:#f1f5f9;margin-bottom:16px;">${subject}</h2>
        <div style="color:#94a3b8;line-height:1.6;">${body}</div>
        <hr style="border:none;border-top:1px solid #2a3352;margin:24px 0;">
        <p style="font-size:12px;color:#64748b;text-align:center;">This is an automated notification from GoalForge Portal.</p>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  isEmailEnabled,
  isTeamsEnabled,
  sendEmail,
  sendTeamsNotification,
  dispatchNotification,
  SMTP_CONFIG,
  TEAMS_WEBHOOK_URL,
  APP_URL,
};
