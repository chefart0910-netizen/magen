const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { runFullScan, toPartialReport } = require("../services/scanner");
const { runFullLoadTest } = require("../services/load-test");
const { runZapBaselineScan } = require("../services/zap-scan");
const { runSecurityScan } = require("../services/security-scan");
const { runActivePentest } = require("../services/pentest-client");
const { isRunnerConfigured, dispatchScanRun } = require("../services/github-runner");
const crypto = require("node:crypto");
const { ah } = require("../async-handler");

const router = express.Router();
router.use(requireAuth);

async function getOwnedSite(siteId, userId) {
  return db.prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?").get(siteId, userId);
}

// POST /api/sites/:siteId/scans - הפעלת בדיקה (עיצוב/ביצועים/נגישות - הבדיקה הבסיסית שכן פועלת)
router.post(
  "/:siteId/scans",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    // סריקה אסינכרונית שהריצה שלה מתה בלי לדווח (למשל כשל בהתקנת התלויות ב-runner)
    // הייתה נשארת "רצה" לנצח ומלכלכת את ההיסטוריה. ל-workflow יש timeout של 10 דקות,
    // אז כל מה שעבר 15 דקות ועדיין "רץ" - לא יחזור. סוגרים אותו לפני שפותחים חדש.
    await db
      .prepare(
        `UPDATE scans SET status = 'failed', completed_at = datetime('now'),
         result_json = '{"error":"הסריקה לא הסתיימה בזמן ולא התקבלה ממנה תוצאה"}'
         WHERE site_id = ? AND status = 'running'
           AND created_at < datetime('now', '-15 minutes')`
      )
      .run(site.id);

    const scanId = uuidv4();

    // הנתיב המועדף: הסריקה רצה על runner של GitHub Actions, בלי תקרת 60 השניות של Vercel
    // ובלי דפדפן מרוחק. הבקשה חוזרת מיד, והתוצאה נכנסת דרך /api/scan-callback.
    if (isRunnerConfigured()) {
      await db
        .prepare("INSERT INTO scans (id, site_id, scan_type, status) VALUES (?, ?, 'lighthouse_axe', 'running')")
        .run(scanId, site.id);
      try {
        await dispatchScanRun({ scanId, url: site.url });
        return res.status(202).json({ scan_id: scanId, status: "running", async: true });
      } catch (err) {
        await db
          .prepare("UPDATE scans SET status = 'failed', result_json = ? WHERE id = ?")
          .run(JSON.stringify({ error: String(err.message || err) }), scanId);
        return res.status(502).json({ error: err.message || "לא ניתן להפעיל את הסריקה" });
      }
    }

    // נתיב הגיבוי: הרצה סינכרונית בתוך הפונקציה עצמה, כפי שהיה עד היום. הוא נשאר כדי
    // שהמערכת תמשיך לעבוד גם לפני שה-runner מוגדר - ובאתרים כבדים הוא מגיע לתקרת הזמן.
    await db
      .prepare("INSERT INTO scans (id, site_id, scan_type, status) VALUES (?, ?, 'lighthouse_axe', 'running')")
      .run(scanId, site.id);

    try {
      const fullResult = await runFullScan(site.url);
      // חבילה חינמית מקבלת דוח חלקי אמיתי (לא מזויף) - ראו סעיף 5 במפרט + scanner.js
      const result = req.user.plan === "free" ? toPartialReport(fullResult) : fullResult;

      await db
        .prepare(
          `UPDATE scans SET status = 'completed', result_json = ?, completed_at = datetime('now'),
           score_performance = ?, score_accessibility = ?, score_seo = ?
           WHERE id = ?`
        )
        .run(
          JSON.stringify(result),
          result.lighthouse?.performance ?? null,
          result.accessibility?.computed_score ?? null,
          result.lighthouse?.seo ?? null,
          scanId
        );

      res.status(201).json({ scan_id: scanId, status: "completed", result });
    } catch (err) {
      await db
        .prepare("UPDATE scans SET status = 'failed', result_json = ? WHERE id = ?")
        .run(JSON.stringify({ error: String(err) }), scanId);
      res.status(500).json({ error: "הסריקה נכשלה", details: String(err) });
    }
  })
);

// GET /api/sites/:siteId/scans - היסטוריית בדיקות לאתר (סעיף 3 במפרט - דוחות/היסטוריה)
router.get(
  "/:siteId/scans",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    const scans = await db
      .prepare(
        "SELECT id, scan_type, status, score_performance, score_accessibility, score_security, score_seo, created_at, completed_at FROM scans WHERE site_id = ? ORDER BY created_at DESC"
      )
      .all(site.id);

    res.json({ scans });
  })
);

// GET /api/scans/:id - פרטי בדיקה מלאים
router.get(
  "/detail/:id",
  ah(async (req, res) => {
    const scan = await db.prepare("SELECT * FROM scans WHERE id = ?").get(req.params.id);
    if (!scan) return res.status(404).json({ error: "בדיקה לא נמצאה" });

    const site = await getOwnedSite(scan.site_id, req.user.id);
    if (!site) return res.status(403).json({ error: "אין הרשאה לצפות בבדיקה זו" });

    res.json({ ...scan, result: scan.result_json ? JSON.parse(scan.result_json) : null });
  })
);

// --- Endpoints לבדיקות שדורשות תשתית חיצונית - מחזירים שגיאה ברורה, לא מדמים הצלחה ---

// POST /api/sites/:siteId/scans/security - סריקת אבטחה פסיבית (services/security-scan.js).
// ==========================================================================================
// הבדיקה רצה בתוך הפונקציה עצמה ולא דורשת תשתית חיצונית: כותרות אבטחה, cookies, תעודת TLS,
// אכיפת HTTPS, נתיבים חשופים ידועים, mixed content ו-SRI. זו סריקה פסיבית - היא רק קוראת,
// לא תוקפת. אם בעתיד יעמוד קונטיינר ZAP (ZAP_API_URL מוגדר) הוא ירוץ בנוסף ותוצאותיו יצורפו
// תחת zap; כישלון שלו לא מפיל את הבדיקה הפסיבית שכבר הצליחה.
router.post(
  "/:siteId/scans/security",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    const scanId = uuidv4();
    await db
      .prepare("INSERT INTO scans (id, site_id, scan_type, status) VALUES (?, ?, 'security_baseline', 'running')")
      .run(scanId, site.id);

    try {
      // בדיקת הנתיבים הניחושיים (/.git, /.env, /wp-config.php.bak...) רצה רק על אתר
      // שהמשתמש הוכיח בעלות עליו. משתמש יכול להוסיף כל כתובת בעולם כ"אתר שלו", ובלי
      // התנאי הזה הוא היה יכול להפעיל דרך MAGEN סדרת בקשות לנתיבים רגישים באתר של אדם
      // אחר - והלוג של אותו אתר היה מראה את זה כמגיע מאיתנו. שאר הבדיקות פסיביות.
      const result = await runSecurityScan(site.url, {
        probeExposedPaths: !!site.ownership_verified,
      });

      if (process.env.ZAP_API_URL) {
        try {
          result.zap = await runZapBaselineScan(site.url);
        } catch (zapErr) {
          result.zap_error = String(zapErr.message || zapErr);
        }
      }

      await db
        .prepare(
          `UPDATE scans SET status = 'completed', result_json = ?, completed_at = datetime('now'),
           score_security = ? WHERE id = ?`
        )
        .run(JSON.stringify(result), result.score ?? null, scanId);

      res.status(201).json({
        scan_id: scanId,
        status: "completed",
        result,
        // מסר מפורש למסך: התמונה חלקית ולמה, כדי שהמשתמש לא יקרא "לא נמצאו ממצאים"
        // כאילו נבדק הכל.
        partial_reason: site.ownership_verified
          ? null
          : "בדיקת הנתיבים החשופים לא בוצעה - היא דורשת אימות בעלות על האתר.",
      });
    } catch (err) {
      await db
        .prepare("UPDATE scans SET status = 'failed', result_json = ? WHERE id = ?")
        .run(JSON.stringify({ error: String(err.message || err) }), scanId);
      res.status(502).json({ error: err.message || "סריקת האבטחה נכשלה" });
    }
  })
);

// POST /api/sites/:siteId/scans/load - k6 full load test (סעיף 2.1, דורש אימות בעלות)
router.post(
  "/:siteId/scans/load",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    // אין טעם לפתוח רשומת סריקה ואז לסמן אותה "נכשל" כשידוע מראש שאין מריץ k6 זמין -
    // זה מלכלך את היסטוריית הבדיקות של המשתמש בכישלונות שאינם באמת כישלוני בדיקה.
    // K6_RUNNER_URL יוגדר כשמריץ ה-k6 (GitHub Actions) יחובר.
    if (!process.env.K6_RUNNER_URL && !process.env.K6_BIN) {
      return res.json({
        available: false,
        feature: "full_load",
        message: "בדיקת עומס מלאה נמצאת בפיתוח ותהיה זמינה בקרוב.",
      });
    }

    if (!site.ownership_verified) {
      return res.status(403).json({
        error: "בדיקת עומס מלאה דורשת אימות בעלות על הדומיין קודם (סעיף 7.4 במפרט)",
      });
    }

    const scanId = uuidv4();
    await db
      .prepare("INSERT INTO scans (id, site_id, scan_type, status) VALUES (?, ?, 'full_load', 'running')")
      .run(scanId, site.id);

    try {
      const result = await runFullLoadTest(site.url, req.body || {});
      await db
        .prepare("UPDATE scans SET status = 'completed', result_json = ?, completed_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(result), scanId);
      res.status(201).json({ scan_id: scanId, status: "completed", result });
    } catch (err) {
      await db
        .prepare("UPDATE scans SET status = 'failed', result_json = ? WHERE id = ?")
        .run(JSON.stringify({ error: String(err.message || err) }), scanId);
      // 424 = Failed Dependency (למשל k6 לא מותקן) - שונה משגיאת "לא ממומש" (501)
      res.status(424).json({ error: err.message || "בדיקת העומס נכשלה" });
    }
  })
);

// POST /api/sites/:siteId/scans/pentest - AI-Powered Active Pentest (סעיף 2.2.1)
// גישה מוגבלת בכוונה לאדמין בלבד (לא רק חבילת פרו/אנטרפרייז) - זהו פיצ'ר בעל רגישות גבוהה
// שמריץ שירות פנטסט חיצוני נפרד (ראו services/pentest-client.js), ולכן דורש שימוש מבוקר.
// כל ניסיון קריאה (הצלחה או כישלון) נרשם ב-audit_log - בלתי ניתן לביטול.
router.post(
  "/:siteId/scans/pentest",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    if (!process.env.STRIX_SERVICE_URL) {
      return res.json({
        available: false,
        feature: "active_pentest",
        message: "פנטסט אקטיבי נמצא בפיתוח ויופעל רק מול שירות פנטסט ייעודי.",
      });
    }

    if (!req.user.is_admin) {
      return res.status(403).json({
        error: "פיצ'ר זה מוגבל לשימוש מבוקר ע\"י אדמין בלבד (לא זמין למשתמשים רגילים, גם לא בחבילות פרו/אנטרפרייז)",
      });
    }
    if (!site.ownership_verified) {
      return res.status(403).json({ error: "פנטסט אקטיבי דורש אימות בעלות ואישור מפורש (סעיף 7.4)" });
    }

    const auditId = uuidv4();
    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'pentest_requested', ?)")
      .run(auditId, req.user.id, `site=${site.url}`);

    try {
      const result = await runActivePentest(site.url, { requestedBy: req.user.email });
      await db
        .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'pentest_completed', ?)")
        .run(uuidv4(), req.user.id, `site=${site.url}`);
      res.json(result);
    } catch (err) {
      await db
        .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'pentest_failed', ?)")
        .run(uuidv4(), req.user.id, `site=${site.url} error=${String(err.message || err)}`);
      res.status(501).json({ error: "פיצ'ר לא זמין עדיין", details: String(err.message || err) });
    }
  })
);

// --- פרסום תוצאה כעמוד ציבורי ---------------------------------------------------------------
// POST /api/sites/:siteId/scans/:scanId/share  { publish: true | false }
// רק בעל האתר, ורק אם הבעלות מאומתת: פרסום ציבורי של חולשות באתר יכול להזיק לבעליו, ולכן
// מי שלא הוכיח שהאתר שלו אינו יכול לפרסם עליו דבר. אדמין פטור כמו בשאר המקומות.
// ביטול הפרסום מיידי ומשאיר את ה-slug, כך שפרסום חוזר לא מייצר כתובת חדשה.
router.post(
  "/:siteId/scans/:scanId/share",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    const scan = await db
      .prepare("SELECT id, site_id, status, is_public, public_slug FROM scans WHERE id = ? AND site_id = ?")
      .get(req.params.scanId, site.id);
    if (!scan) return res.status(404).json({ error: "בדיקה לא נמצאה" });

    const publish = req.body?.publish !== false;

    if (publish) {
      if (!site.ownership_verified && !req.user.is_admin) {
        return res.status(403).json({
          error: "פרסום תוצאה ציבורית דורש אימות בעלות על האתר.",
        });
      }
      if (scan.status !== "completed") {
        return res.status(409).json({ error: "אפשר לפרסם רק בדיקה שהושלמה" });
      }

      const slug = scan.public_slug || crypto.randomBytes(4).toString("hex");
      await db
        .prepare("UPDATE scans SET is_public = 1, public_slug = ? WHERE id = ?")
        .run(slug, scan.id);
      await db
        .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'scan_published', ?)")
        .run(uuidv4(), req.user.id, `site=${site.url} scan=${scan.id} slug=${slug}`);

      return res.json({ is_public: true, public_slug: slug, path: `/s/${slug}` });
    }

    await db.prepare("UPDATE scans SET is_public = 0 WHERE id = ?").run(scan.id);
    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'scan_unpublished', ?)")
      .run(uuidv4(), req.user.id, `site=${site.url} scan=${scan.id}`);

    res.json({ is_public: false, public_slug: scan.public_slug || null });
  })
);

module.exports = router;
