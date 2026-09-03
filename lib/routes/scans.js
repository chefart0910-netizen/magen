const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { runFullScan, toPartialReport } = require("../services/scanner");
const { runFullLoadTest } = require("../services/load-test");
const { runZapBaselineScan } = require("../services/zap-scan");
const { runActivePentest } = require("../services/pentest-client");
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

    const scanId = uuidv4();
    await db
      .prepare("INSERT INTO scans (id, site_id, scan_type, status) VALUES (?, ?, 'lighthouse_axe', 'running')")
      .run(scanId, site.id);

    // מריצים סינכרונית ל-MVP. בפרודקשן: להעביר לתור עבודה (BullMQ) כדי לא לחסום את ה-API.
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
        "SELECT id, scan_type, status, score_performance, score_accessibility, score_seo, created_at, completed_at FROM scans WHERE site_id = ? ORDER BY created_at DESC"
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

// POST /api/sites/:siteId/scans/security - OWASP ZAP baseline (פרו+, סעיף 2.2)
router.post(
  "/:siteId/scans/security",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });
    try {
      const result = await runZapBaselineScan(site.url);
      res.json(result);
    } catch (err) {
      res.status(501).json({ error: "פיצ'ר לא זמין עדיין", details: String(err) });
    }
  })
);

// POST /api/sites/:siteId/scans/load - k6 full load test (סעיף 2.1, דורש אימות בעלות)
router.post(
  "/:siteId/scans/load",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });
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

module.exports = router;
