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
const { normalizeUrl } = require("../normalize-url");
// ההגנה עברה ל-lib/ssrf-guard.js כדי שגם המסלולים המחוברים יקבלו אותה. היא היתה כאן
// בלבד, ולכן משתמש רשום (וההרשמה פתוחה) עקף אותה פשוט על ידי הוספת אתר.
const { assertScannableTarget } = require("../ssrf-guard");
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

// X-Forwarded-For הוא רשימה שבה כל proxy *מוסיף* בסוף, ואף אחד לא מנקה את מה שהגיע
// מהלקוח. לכן הערך השמאלי - שהיה בשימוש כאן - הוא בדיוק החלק שהלקוח שולט בו: שליחת
// כותרת שונה בכל בקשה נתנה סריקות ללא הגבלה. הערך שנוסף על ידי ה-proxy שלנו הוא
// הימני, וב-Vercel יש גם x-real-ip שנכתב על ידי הפלטפורמה ולא על ידי הלקוח.
function clientIp(req) {
  const real = String(req.headers["x-real-ip"] || "").trim();
  if (real) return real;
  const chain = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  return req.socket?.remoteAddress || "unknown";
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

  // לפני התיקון היה כאן hits.clear() מעל 5000 מפתחות - כלומר כמה אלפי בקשות מזויפות
  // אפסו את המנייה של *כל* המשתמשים הלגיטימיים. מפנים רק רשומות שפג תוקפן.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
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
      // תקנה 35(ה) מוחזרת במלואה גם בטעימה החינמית, ובכוונה. זו הבדיקה היחידה כאן
      // שהיא תשובה חד-משמעית לשאלה משפטית קונקרטית, והיא גם *העילה* שעליה הוגשו בפועל
      // רוב התביעות בישראל. אין שום היגיון להסתיר דווקא אותה מאחורי הרשמה: זה מה שגורם
      // למבקר להבין תוך שלוש שניות למה הכלי הזה רלוונטי לו.
      accessibility_statement: result.accessibility_statement || null,
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
    // הנתיבים הציבוריים אינם עוברים ב-requireAuth, וזה המקום היחיד שקרא ל-ensureReady.
    // בלעדיו מופע "קר" של הפונקציה יכול לפגוש טבלה שהמיגרציה עליה עוד לא רצה - וזה בדיוק
    // מה שקרה: "no such column: public_slug".
    await db.ensureReady();

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
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://magenscan.com").replace(/\/$/, "");

// מוגש בשני נתיבים: /api/public/sitemap.xml (דרך ה-router) ו-/sitemap-scans.xml (מחובר
// ישירות ב-api/index.js). Vercel לא משרשרת rewrites, ולכן rewrite שמצביע על נתיב שאין לו
// קובץ פלט מחזיר 404 - הדרך שעובדת היא להצביע על הפונקציה ולתת ל-Express לזהות את הנתיב.
const sitemapHandler = ah(async (_req, res) => {
  // ראו ההערה בנתיב התוצאה: בלי ensureReady העמודות is_public/public_slug עשויות לא
  // להתקיים עוד במופע הזה.
  await db.ensureReady();

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
});

router.get("/sitemap.xml", sitemapHandler);

module.exports = router;
module.exports.sitemapHandler = sitemapHandler;
