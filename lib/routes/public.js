// MAGEN - נתיב ציבורי לסריקת טעימה מעמוד הבית.
// ==========================================================================================
// למה זה קיים: עד עכשיו כל מסלול באפליקציה היה מאחורי התחברות, כלומר גוגל וכל מבקר חדש
// ראו מסך התחברות בלבד. העמוד הציבורי נותן למבקר תוצאה אמיתית על האתר שלו לפני הרשמה.
//
// מה נחשף ומה לא: מוחזרים הציון, הדירוג, פילוח לפי חומרה ושלושת הממצאים הבולטים - בכותרת
// בלבד. ההסבר המלא וההוראות לתיקון (guided_fix) נשארים בצד המשלם. זו טעימה, לא הדוח.
//
// נבחרה דווקא סריקת האבטחה הפסיבית (security-scan.js) ולא Lighthouse: היא עצמאית לחלוטין,
// מסתיימת בשניות, לא צורכת דקות runner ולא כותבת שורה למסד הנתונים. סריקה ציבורית שמפעילה
// את ה-runner של GitHub על כל מבקר אנונימי היא הזמנה לניצול.

const express = require("express");
const dns = require("node:dns").promises;
const net = require("node:net");
const { normalizeUrl } = require("../normalize-url");
const { runSecurityScan } = require("../services/security-scan");
const { ah } = require("../async-handler");

const router = express.Router();

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 5;

// הגבלת קצב בזיכרון הפונקציה. חשוב להבין את המגבלה: ב-Vercel יש כמה מופעים של הפונקציה,
// וכל מופע מחזיק מנייה נפרדת, כך שבפועל התקרה גבוהה מ-5. זה חסם ראשון נגד לחיצה חוזרת
// ונגד סקריפט נאיבי, לא הגנה מלאה. הגנה אמיתית דורשת מנייה משותפת (טבלה ב-Turso או KV),
// וזה הצעד הבא אם נראה שימוש לרעה בפועל.
const hits = new Map();

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_IP) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

// חסימת SSRF. בלי זה מבקר אנונימי יכול לבקש סריקה של 127.0.0.1 או של כתובת פנימית בענן
// (169.254.169.254 - מטא-דאטה של הספק) ולהשתמש בשרת שלנו כדי להציץ פנימה.
function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true;
  if (v6.startsWith("fe80")) return true;
  if (v6.startsWith("::ffff:")) return isBlockedAddress(v6.slice(7));
  return false;
}

async function assertScannableTarget(url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("אפשר לסרוק רק כתובות http או https");
  }
  if (url.username || url.password) {
    throw new Error("כתובת עם שם משתמש או סיסמה אינה נסרקת");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("אפשר לסרוק רק את הפורטים הרגילים של אתרי אינטרנט");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || !host.includes(".")) {
    throw new Error("הכתובת אינה אתר ציבורי");
  }
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new Error("הכתובת אינה אתר ציבורי");
  }

  let records = [];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`לא מצאנו את הכתובת ${host}. נא לבדוק את האיות.`);
  }
  if (records.length === 0 || records.some((r) => isBlockedAddress(r.address))) {
    throw new Error("הכתובת אינה אתר ציבורי");
  }
}

// POST /api/public/scan - סריקת אבטחה פסיבית ללא התחברות, תוצאה חלקית בלבד.
router.post(
  "/scan",
  ah(async (req, res) => {
    const raw = typeof req.body?.url === "string" ? req.body.url : "";
    if (!raw.trim()) {
      return res.status(400).json({ error: "נא להזין כתובת אתר" });
    }

    const normalized = normalizeUrl(raw);
    if (!normalized) {
      return res.status(400).json({ error: "הכתובת אינה תקינה" });
    }

    if (isRateLimited(clientIp(req))) {
      return res.status(429).json({
        error: "הגעת למספר הסריקות החינמיות לשעה. פתיחת חשבון מסירה את ההגבלה.",
      });
    }

    let url;
    try {
      url = new URL(normalized);
      await assertScannableTarget(url);
    } catch (err) {
      return res.status(400).json({ error: err.message || "הכתובת אינה תקינה" });
    }

    let result;
    try {
      result = await runSecurityScan(url.toString());
    } catch (err) {
      console.error("סריקה ציבורית נכשלה:", url.hostname, err?.message || err);
      return res.status(502).json({ error: err?.message || "לא הצלחנו לסרוק את האתר הזה" });
    }

    const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const f of result.findings || []) {
      if (bySeverity[f.severity] !== undefined) bySeverity[f.severity] += 1;
    }

    const preview = (result.findings || []).slice(0, 3).map((f) => ({
      severity: f.severity,
      title: f.title,
    }));

    res.json({
      url: result.url,
      scanned_at: result.scanned_at,
      score: result.score,
      grade: result.grade,
      findings_count: result.findings_count,
      by_severity: bySeverity,
      preview,
      locked_count: Math.max(0, (result.findings_count || 0) - preview.length),
      https_enforced: result.https?.enforced ?? null,
      certificate_days_remaining: result.certificate?.days_remaining ?? null,
    });
  })
);

module.exports = router;
