// MAGEN - בק-אופיס (סעיף 4, 6 במפרט): ניהול משתמשים, מעקב אתרים/סריקות, לוגים.
// כל הנתיבים כאן דורשים requireAuth + requireAdmin.

const express = require("express");
const { v4: uuidv4 } = require("uuid");
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
        `SELECT u.id, u.email, u.full_name, u.plan, u.is_admin, u.is_expert,
                u.account_type, u.professional_title, u.professional_site,
                u.reviews_approved, u.created_at,
                COUNT(s.id) as sites_count,
                -- הראיה היחידה שאפשר לבדוק אוטומטית לפני אישור: מה הכלי עצמו אומר על
                -- האתר שאיש המקצוע הצהיר עליו כשלו.
                (SELECT sc.score_accessibility
                   FROM scans sc JOIN sites ps ON ps.id = sc.site_id
                  WHERE ps.user_id = u.id AND ps.url = u.professional_site
                    AND sc.status = 'completed'
                  ORDER BY sc.created_at DESC LIMIT 1) AS pro_site_accessibility,
                (SELECT sc.score_performance
                   FROM scans sc JOIN sites ps ON ps.id = sc.site_id
                  WHERE ps.user_id = u.id AND ps.url = u.professional_site
                    AND sc.status = 'completed'
                  ORDER BY sc.created_at DESC LIMIT 1) AS pro_site_performance
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

// PATCH /api/admin/users/:id/expert - סימון משתמש כמומחה (רשאי לכתוב חוות דעת על סריקות).
// בכוונה ידני ובכוונה כאן: חוות דעת חתומה נכנסת לדוח שהלקוח מקבל, ולכן מי שכותב אותה
// צריך לעבור אישור אנושי ולא הרשמה עצמית. כל שינוי נרשם ב-audit_log.
router.patch(
  "/users/:id/expert",
  ah(async (req, res) => {
    const { is_expert } = req.body || {};
    if (typeof is_expert !== "boolean") {
      return res.status(400).json({ error: "נדרש ערך בוליאני בשדה is_expert" });
    }
    const result = await db
      .prepare("UPDATE users SET is_expert = ? WHERE id = ?")
      .run(is_expert ? 1 : 0, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "משתמש לא נמצא" });

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(uuidv4(), req.user.id, is_expert ? "expert_granted" : "expert_revoked", `user=${req.params.id}`);

    res.json({ ok: true });
  })
);

// GET /api/admin/pending-reviews - חוות דעת שממתינות לאישור (תקופת הניסיון של מומחה חדש).
// אי אפשר לאמת מקצועיות בהרשמה, ולכן ההגנה האמיתית היא כאן: אף חוות דעת של מומחה חדש
// לא מגיעה ללקוח לפני שנקראה.
router.get(
  "/pending-reviews",
  ah(async (_req, res) => {
    const reviews = await db
      .prepare(
        `SELECT r.*, s.url AS site_url, u.email AS expert_email, u.reviews_approved
         FROM expert_reviews r
         JOIN sites s ON s.id = r.site_id
         JOIN users u ON u.id = r.expert_user_id
         WHERE r.status = 'pending'
         ORDER BY r.created_at ASC`
      )
      .all();
    res.json({ reviews });
  })
);

// PATCH /api/admin/reviews/:id - אישור או דחייה של חוות דעת ממתינה.
// אישור מקדם את מונה חוות הדעת המאושרות של המומחה; כשהוא עובר את סף תקופת הניסיון
// (PROBATION_REVIEWS ב-routes/reviews.js) הוא מפרסם מכאן ואילך ישירות.
router.patch(
  "/reviews/:id",
  ah(async (req, res) => {
    const { action } = req.body || {};
    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({ error: "פעולה לא תקינה" });
    }

    const review = await db.prepare("SELECT * FROM expert_reviews WHERE id = ?").get(req.params.id);
    if (!review) return res.status(404).json({ error: "חוות דעת לא נמצאה" });

    if (action === "approve") {
      await db.prepare("UPDATE expert_reviews SET status = 'published' WHERE id = ?").run(review.id);
      await db
        .prepare("UPDATE users SET reviews_approved = reviews_approved + 1 WHERE id = ?")
        .run(review.expert_user_id);
    } else {
      // דחייה משאירה את חוות הדעת שמורה במצב 'rejected' ולא מוחקת אותה: צריך להישאר
      // תיעוד של מה נכתב ונדחה, גם אם הלקוח לעולם לא ראה את זה.
      await db.prepare("UPDATE expert_reviews SET status = 'rejected' WHERE id = ?").run(review.id);
    }

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(
        uuidv4(),
        req.user.id,
        action === "approve" ? "review_approved" : "review_rejected",
        `review=${review.id} expert=${review.expert_user_id}`
      );

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
