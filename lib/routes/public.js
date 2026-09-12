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
//
// גבול נוסף, והוא העיקר: הנתיב הזה קורא רק את מה שהאתר מחזיר לכל גולש בעמוד הבית -
// כותרות, עוגיות, תעודה, תוכן מעורב. הוא *לא* מבקש נתיבים ניחושיים, כי המבקש כאן לא
// הוכיח שום קשר לאתר הנסרק. MAGEN לא אמור להזיק לאתרים דרך המשתמשים שלו.

const express = require("express");
const dns = require("node:dns").promises;
const net = require("node:net");
const { normalizeUrl } = require("../normalize-url");
const { runSecurityScan } = require("../services/security-scan");
const db = require("../db");
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
      // ללא בדיקת נתיבים ניחושיים: מבקש הסריקה כאן אנונימי ולא הוכיח קשר לאתר, ולכן
      // MAGEN לא שולח לאתר של אדם זר סדרת בקשות ל-/.git, /.env או /wp-config.php.bak.
      // הבדיקה המלאה נשארת למשתמש מחובר על אתר שאימת שהוא שלו (ראו routes/scans.js).
      result = await runSecurityScan(url.toString(), { probeExposedPaths: false });
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

// --- עמוד תוצאה ציבורי לסריקה ---------------------------------------------------------------
// בעל אתר *מאומת* יכול לפרסם סריקה של עצמו בכתובת קצרה וקבועה. הכתובת נפתחת לכל אחד
// ואינדקסבילית בגוגל - זה כל הרעיון: שיתוף בוואטסאפ ותנועה אורגנית.
//
// למה אימות בעלות הוא תנאי לפרסום: פרסום ציבורי של חולשות אבטחה באתר הוא מעשה שיכול
// להזיק לבעל האתר. מי שלא הוכיח שהאתר שלו לא מפרסם עליו כלום.
//
// מה נחשף: ציונים, מספר ממצאים לפי חומרה, וכותרות שלושת הבולטים. מה לא: הוראות התיקון
// (guided_fix), פירוט הנתיבים והאלמנטים שנמצאו, זהות בעל האתר, והיסטוריית הסריקות.
// הסיבה כפולה - גם ערך מסחרי וגם לא לספק לתוקף מפת דרכים לאתר של הלקוח.

function publicFindings(result) {
  // סריקת אבטחה
  if (Array.isArray(result?.findings)) {
    return result.findings.slice(0, 3).map((f) => ({ severity: f.severity, title: f.title }));
  }
  // סריקת נגישות/ביצועים
  if (Array.isArray(result?.accessibility?.violations)) {
    return result.accessibility.violations
      .slice(0, 3)
      .map((v) => ({ severity: v.impact, title: v.description }));
  }
  return [];
}

// GET /api/public/scan/:slug - התוצאה הציבורית. ללא התחברות.
router.get(
  "/scan/:slug",
  ah(async (req, res) => {
    const row = await db
      .prepare(
        `SELECT s.id, s.scan_type, s.status, s.result_json, s.created_at, s.completed_at,
                s.score_performance, s.score_accessibility, s.score_security, s.score_seo,
                sites.url AS site_url
         FROM scans s JOIN sites ON sites.id = s.site_id
         WHERE s.public_slug = ? AND s.is_public = 1 AND s.status = 'completed'`
      )
      .get(req.params.slug);

    if (!row) return res.status(404).json({ error: "התוצאה לא נמצאה או שאינה ציבורית" });

    let result = null;
    try {
      result = row.result_json ? JSON.parse(row.result_json) : null;
    } catch {
      result = null;
    }

    const findings = publicFindings(result);
    const totalFindings =
      result?.findings_count ?? result?.accessibility?.violations_count ?? findings.length;

    res.json({
      site_url: row.site_url,
      scan_type: row.scan_type,
      scanned_at: row.completed_at || row.created_at,
      scores: {
        security: row.score_security,
        accessibility: row.score_accessibility,
        performance: row.score_performance,
        seo: row.score_seo,
      },
      grade: result?.grade ?? null,
      findings_count: totalFindings,
      preview: findings,
      locked_count: Math.max(0, (totalFindings || 0) - findings.length),
    });
  })
);

// GET /api/public/sitemap.xml - מפת אתר דינמית לעמודי התוצאה שפורסמו.
// ==========================================================================================
// sitemap.xml הסטטי שב-public/ מכיל רק את העמודים הקבועים. עמודי /s/:slug נוצרים בזמן
// אמת, ולכן הם צריכים מפה שנבנית מהמסד. ב-vercel.json יש rewrite מ-/sitemap-scans.xml
// לכאן, ו-robots.txt מצביע על שתי המפות - זה תקני, גוגל מקבל כמה שורות Sitemap.
//
// כתובת הבסיס נלקחת מ-PUBLIC_BASE_URL ולא מכותרת ה-Host: כותרת Host אפשר לזייף, ואז
// היינו מפרסמים לגוגל כתובות בדומיין של מישהו אחר. כשיוחלף הדומיין - מעדכנים משתנה אחד.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://magen-pi.vercel.app").replace(/\/$/, "");

router.get(
  "/sitemap.xml",
  ah(async (_req, res) => {
    const rows = await db
      .prepare(
        `SELECT public_slug, completed_at, created_at
         FROM scans
         WHERE is_public = 1 AND status = 'completed' AND public_slug IS NOT NULL
         ORDER BY COALESCE(completed_at, created_at) DESC
         LIMIT 5000`
      )
      .all();

    const urls = rows
      .map((r) => {
        const lastmod = String(r.completed_at || r.created_at || "").slice(0, 10);
        return [
          "  <url>",
          `    <loc>${PUBLIC_BASE_URL}/s/${r.public_slug}</loc>`,
          lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
          "    <changefreq>monthly</changefreq>",
          "    <priority>0.5</priority>",
          "  </url>",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  })
);

module.exports = router;
