// MAGEN - בדיקת "חיים" קלה לכל אתר: זמינות (HTTP) ותוקף תעודת ה-SSL. רצה הרבה יותר
// לעיתים קרובות מהסריקה המלאה (lighthouse/axe) - זו לא בדיקת ביצועים או נגישות, רק
// "האתר עונה?" ו"כמה זמן נשאר לתעודה?". ראו lib/routes/cron.js (monitor-checks) ו-
// lib/services/alerts.js (מה קורה כששינוי מצב מתגלה).

const tls = require("node:tls");
const { URL } = require("node:url");

const HTTP_TIMEOUT_MS = 10000;
const TLS_TIMEOUT_MS = 8000;

// בדיקת HTTP: HEAD קודם (קל יותר לשרת), ונפילה ל-GET אם השרת לא תומך ב-HEAD (405/501
// הם תשובה תקינה מהשרת, לא "האתר למטה" - אבל כמה שרתים מחזירים שגיאה אחרת על HEAD).
async function checkHttp(url) {
  const started = Date.now();
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "MAGEN-Monitor/1.0" },
      });
      return { statusCode: res.status };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let result;
    try {
      result = await attempt("HEAD");
    } catch {
      result = await attempt("GET");
    }
    const responseTimeMs = Date.now() - started;
    const isUp = result.statusCode < 500;
    return { isUp, statusCode: result.statusCode, responseTimeMs };
  } catch (err) {
    return { isUp: false, statusCode: null, responseTimeMs: Date.now() - started, error: String(err?.message || err) };
  }
}

// תוקף תעודת ה-SSL דרך node:tls ישירות על השם (לא דרך fetch, שלא חושף פרטי תעודה).
// רק hostnames https רלוונטיים - אתר http פשוט לא נבדק, ואין בזה כשל.
function checkSsl(hostname) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, timeout: TLS_TIMEOUT_MS },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
          const daysRemaining = validTo
            ? Math.floor((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null;
          finish({ validTo: validTo ? validTo.toISOString() : null, daysRemaining });
        } catch (err) {
          finish({ validTo: null, daysRemaining: null, error: String(err?.message || err) });
        } finally {
          socket.end();
        }
      }
    );
    socket.on("timeout", () => {
      socket.destroy();
      finish({ validTo: null, daysRemaining: null, error: "timeout" });
    });
    socket.on("error", (err) => {
      finish({ validTo: null, daysRemaining: null, error: String(err?.message || err) });
    });
  });
}

// בדיקה מלאה לאתר אחד: זמינות + (אם https) תוקף SSL.
async function checkSiteHealth(url) {
  const parsed = new URL(url);
  const http = await checkHttp(url);
  let ssl = { validTo: null, daysRemaining: null };
  if (parsed.protocol === "https:") {
    ssl = await checkSsl(parsed.hostname);
  }
  return { http, ssl };
}

module.exports = { checkSiteHealth, checkHttp, checkSsl };
