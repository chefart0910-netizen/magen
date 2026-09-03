// MAGEN - בק-אופיס (סעיף 4, 6 במפרט): ניהול משתמשים, מעקב אתרים/סריקות, לוגים.
// כל הנתיבים כאן דורשים requireAuth + requireAdmin.

const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { ah } = require("../async-handler");

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats - סטטיסטיקות מערכת כלליות לדשבורד תפעולי
router.get(
  "/stats",
  ah(async (_req, res) => {
    const usersCount = (await db.prepare("SELECT COUNT(*) as c FROM users").get()).c;
    const sitesCount = (await db.prepare("SELECT COUNT(*) as c FROM sites").get()).c;
    const scansCount = (await db.prepare("SELECT COUNT(*) as c FROM scans").get()).c;
    const scansByStatus = await db.prepare("SELECT status, COUNT(*) as c FROM scans GROUP BY status").all();
    const usersByPlan = await db.prepare("SELECT plan, COUNT(*) as c FROM users GROUP BY plan").all();

    res.json({ usersCount, sitesCount, scansCount, scansByStatus, usersByPlan });
  })
);

// GET /api/admin/users - רשימת כל המשתמשים במערכת (ללא סיסמאות!)
router.get(
  "/users",
  ah(async (_req, res) => {
    const users = await db
      .prepare(
        `SELECT u.id, u.email, u.full_name, u.plan, u.is_admin, u.created_at,
                COUNT(s.id) as sites_count
         FROM users u
         LEFT JOIN sites s ON s.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at DESC`
      )
      .all();
    res.json({ users });
  })
);

// PATCH /api/admin/users/:id/plan - עדכון חבילה למשתמש (ניהול ידני ע"י אדמין)
router.patch(
  "/users/:id/plan",
  ah(async (req, res) => {
    const { plan } = req.body || {};
    const validPlans = ["free", "basic", "pro", "enterprise"];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: "חבילה לא תקינה" });
    }
    const result = await db.prepare("UPDATE users SET plan = ? WHERE id = ?").run(plan, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "משתמש לא נמצא" });
    res.json({ ok: true });
  })
);

// GET /api/admin/sites - כל האתרים במערכת, עם בעל האתר
router.get(
  "/sites",
  ah(async (_req, res) => {
    const sites = await db
      .prepare(
        `SELECT sites.id, sites.url, sites.label, sites.ownership_verified, sites.created_at,
                users.email as owner_email
         FROM sites
         JOIN users ON users.id = sites.user_id
         ORDER BY sites.created_at DESC`
      )
      .all();
    res.json({ sites });
  })
);

// GET /api/admin/scans - כל הסריקות במערכת (לניטור תורים/עומס - סעיף 4 במפרט)
router.get(
  "/scans",
  ah(async (_req, res) => {
    const scans = await db
      .prepare(
        `SELECT scans.id, scans.scan_type, scans.status, scans.score_performance,
                scans.score_accessibility, scans.score_seo, scans.created_at, scans.completed_at,
                sites.url as site_url, users.email as owner_email
         FROM scans
         JOIN sites ON sites.id = scans.site_id
         JOIN users ON users.id = sites.user_id
         ORDER BY scans.created_at DESC
         LIMIT 200`
      )
      .all();
    res.json({ scans });
  })
);

// GET /api/admin/audit-log - לוג ביקורת בלתי ניתן לשינוי (סעיף 7.2 במפרט)
router.get(
  "/audit-log",
  ah(async (_req, res) => {
    const logs = await db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
    res.json({ logs });
  })
);

module.exports = router;
