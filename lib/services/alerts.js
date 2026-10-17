// MAGEN - שליחת התראות מעקב (ראו lib/routes/cron.js - monitor-checks): קריסה, חזרה
// לפעולה, SSL שעומד לפוג, וממצא נגישות/אבטחה חדש שלא היה בסריקה הקודמת.
// ==========================================================================================
// שער חבילה, במתכונת זהה למה ש-scans.js עושה עם req.user.plan === "free" (דוח חלקי):
// כל המשתמשים מקבלים התראת מייל; webhook (כולל Slack/Discord Incoming Webhook, ששניהם
// מקבלים POST של {"text": "..."}) זמין רק למי שאינו בחבילה החינמית.

const { sendMail } = require("../mailer");

const WEBHOOK_TIMEOUT_MS = 8000;

function webhookAllowed(user) {
  return user.plan !== "free";
}

const SUBJECTS = {
  down: (site) => `MAGEN - האתר ${site.url} לא מגיב`,
  up: (site) => `MAGEN - האתר ${site.url} חזר לפעול`,
  ssl_expiring: (site, event) =>
    `MAGEN - תעודת ה-SSL של ${site.url} פגה בעוד ${event.daysRemaining} ימים`,
  new_violation: (site) => `MAGEN - נמצא ממצא חדש באתר ${site.url}`,
};

function textFor(site, event) {
  switch (event.type) {
    case "down":
      return `האתר ${site.url} לא הגיב (קוד: ${event.statusCode ?? "אין תגובה"}). נבדוק שוב בבדיקה הבאה.`;
    case "up":
      return `האתר ${site.url} חזר להגיב כרגיל.`;
    case "ssl_expiring":
      return `תעודת ה-SSL של ${site.url} פגה בעוד ${event.daysRemaining} ימים (בתאריך ${event.validTo}). מומלץ לחדש בהקדם.`;
    case "new_violation":
      return `נמצא ממצא חדש בסריקה האחרונה של ${site.url}: ${event.ruleId} - ${event.description || ""}`;
    default:
      return `עודכן סטטוס המעקב של ${site.url}.`;
  }
}

function webhookPayload(site, event) {
  // תואם Slack/Discord Incoming Webhook: שניהם מקבלים POST של {"text": "..."} ישירות,
  // בלי אינטגרציה נפרדת - מספיק להדביק את כתובת ה-Webhook בשדה למטה.
  return { text: `*MAGEN*\n${SUBJECTS[event.type]?.(site, event) || "עדכון מעקב"}\n${textFor(site, event)}` };
}

async function sendWebhook(webhookUrl, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// שולח התראה אחת (מייל + webhook אם מורשה ומוגדר) על event אחד, לבעלים של האתר.
// event = { type: 'down'|'up'|'ssl_expiring'|'new_violation', ...פרטים ספציפיים לסוג }
async function notifySiteEvent(user, site, event) {
  const results = {};

  if (user.alerts_email_enabled !== 0 && user.email) {
    const subject = SUBJECTS[event.type]?.(site, event) || "MAGEN - עדכון מעקב";
    results.email = await sendMail({ to: user.email, subject, text: textFor(site, event) });
  }

  if (webhookAllowed(user) && user.alerts_webhook_enabled && user.webhook_url) {
    results.webhook = await sendWebhook(user.webhook_url, webhookPayload(site, event));
  }

  return results;
}

module.exports = { notifySiteEvent, webhookAllowed, webhookPayload };
