// MAGEN - הרשאת מומחה לאתר של לקוח.
// ==========================================================================================
// הבעיה שזה פותר: עד עכשיו סימון is_expert לבד נתן גישה לחוות דעת על *כל* סריקה במערכת.
// מומחה יכול היה לקרוא ולכתוב על אתר של לקוח שלא מכיר אותו ולא אישר לו דבר.
//
// המודל: ההרשאה היא של בעל האתר. הוא מעניק לפי כתובת מייל, והוא מבטל. אין דרך שבה מומחה
// מעניק לעצמו, ואין "בקשה" שמאושרת אוטומטית. כל הענקה וכל ביטול נכנסים ל-audit_log.
//
// מה ההרשאה *לא* חוסמת: סריקה פסיבית של אתר מעמוד הבית הציבורי. מומחה שרוצה לאתר לקוח
// חדש יכול לבדוק כל אתר משם ולפנות לבעליו - זו דרך ההיכרות, והיא לא נוגעת בנתוני אף לקוח.
// ההרשאה נדרשת רק לכניסה לדוח של לקוח קיים ולחתימה עליו בשם.

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ah } = require("../async-handler");

const router = express.Router();
router.use(requireAuth);

async function getOwnedSite(siteId, userId) {
  return db.prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?").get(siteId, userId);
}

async function listGrants(siteId) {
  return db
    .prepare(
      `SELECT g.id, g.status, g.created_at, g.revoked_at,
              u.id AS expert_user_id, u.email AS expert_email, u.full_name AS expert_name,
              u.professional_title AS expert_title
       FROM site_grants g JOIN users u ON u.id = g.expert_user_id
       WHERE g.site_id = ?
       ORDER BY g.created_at DESC`
    )
    .all(siteId);
}

// GET /api/grants/site/:siteId - למי בעל האתר נתן הרשאה.
router.get(
  "/site/:siteId",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });
    res.json({ grants: await listGrants(site.id) });
  })
);

// POST /api/grants/site/:siteId - הענקת הרשאה לפי מייל. רק בעל האתר.
router.post(
  "/site/:siteId",
  ah(async (req, res) => {
    const site = await getOwnedSite(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "נא להזין כתובת מייל של המומחה" });

    const expert = await db
      .prepare("SELECT id, email, is_expert, is_admin FROM users WHERE lower(email) = ?")
      .get(email);

    // לא חושפים אם המייל קיים במערכת: זה היה מאפשר לדלות רשימת משתמשים דרך הטופס.
    if (!expert || !(expert.is_expert || expert.is_admin)) {
      return res.status(404).json({
        error: "לא נמצא מומחה מאושר עם הכתובת הזו. בקשו מהמומחה להירשם ולהיות מאושר תחילה.",
      });
    }
    if (expert.id === req.user.id) {
      return res.status(400).json({ error: "האתר כבר שלך - אין צורך בהרשאה" });
    }

    const existing = await db
      .prepare("SELECT * FROM site_grants WHERE site_id = ? AND expert_user_id = ?")
      .get(site.id, expert.id);

    if (existing) {
      if (existing.status === "active") {
        return res.status(409).json({ error: "למומחה הזה יש כבר הרשאה לאתר" });
      }
      // הרשאה שבוטלה בעבר מוחזרת לחיים במקום ליצור שורה שנייה לאותו זוג.
      await db
        .prepare("UPDATE site_grants SET status = 'active', revoked_at = NULL, created_at = datetime('now') WHERE id = ?")
        .run(existing.id);
    } else {
      await db
        .prepare(
          `INSERT INTO site_grants (id, site_id, expert_user_id, granted_by_user_id, status)
           VALUES (?, ?, ?, ?, 'active')`
        )
        .run(uuidv4(), site.id, expert.id, req.user.id);
    }

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'grant_created', ?)")
      .run(uuidv4(), req.user.id, `site=${site.url} expert=${expert.email}`);

    res.status(201).json({ grants: await listGrants(site.id) });
  })
);

// DELETE /api/grants/:id - ביטול הרשאה. רק בעל האתר. ביטול הוא מיידי.
router.delete(
  "/:id",
  ah(async (req, res) => {
    const grant = await db.prepare("SELECT * FROM site_grants WHERE id = ?").get(req.params.id);
    if (!grant) return res.status(404).json({ error: "הרשאה לא נמצאה" });

    const site = await getOwnedSite(grant.site_id, req.user.id);
    if (!site) return res.status(403).json({ error: "רק בעל האתר יכול לבטל הרשאה" });

    await db
      .prepare("UPDATE site_grants SET status = 'revoked', revoked_at = datetime('now') WHERE id = ?")
      .run(grant.id);

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'grant_revoked', ?)")
      .run(uuidv4(), req.user.id, `site=${site.url} grant=${grant.id}`);

    res.json({ grants: await listGrants(site.id) });
  })
);

// GET /api/grants/mine - האתרים שהוענקה לי הרשאה אליהם (צד המומחה).
router.get(
  "/mine",
  ah(async (req, res) => {
    const sites = await db
      .prepare(
        `SELECT g.id AS grant_id, g.created_at, s.id AS site_id, s.url, s.label
         FROM site_grants g JOIN sites s ON s.id = g.site_id
         WHERE g.expert_user_id = ? AND g.status = 'active'
         ORDER BY g.created_at DESC`
      )
      .all(req.user.id);
    res.json({ sites });
  })
);

module.exports = router;
