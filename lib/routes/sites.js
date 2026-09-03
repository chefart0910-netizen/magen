// MAGEN - ניהול אתרים של המשתמש (סעיף 3 במפרט - הוספה/רשימה/מחיקה + אימות בעלות לפני
// בדיקות רגישות כמו full_load / active_pentest, ראו scans.js).

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ah } = require("../async-handler");

const router = express.Router();
router.use(requireAuth);

function normalizeUrl(raw) {
  if (!raw) return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    return new URL(url).toString();
  } catch (err) {
    return null;
  }
}

// GET /api/sites - רשימת האתרים של המשתמש המחובר, כולל מספר הבדיקות שבוצעו לכל אתר
router.get(
  "/",
  ah(async (req, res) => {
    const sites = await db
      .prepare(
        `SELECT sites.*, COUNT(scans.id) as scans_count
         FROM sites
         LEFT JOIN scans ON scans.site_id = sites.id
         WHERE sites.user_id = ?
         GROUP BY sites.id
         ORDER BY sites.created_at DESC`
      )
      .all(req.user.id);

    res.json({ sites });
  })
);

// POST /api/sites - הוספת אתר חדש למעקב
router.post(
  "/",
  ah(async (req, res) => {
    const { url: rawUrl, label } = req.body || {};
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return res.status(400).json({ error: "כתובת אתר לא תקינה" });
    }

    const id = uuidv4();
    await db
      .prepare("INSERT INTO sites (id, user_id, url, label) VALUES (?, ?, ?, ?)")
      .run(id, req.user.id, url, label || null);

    const site = await db.prepare("SELECT * FROM sites WHERE id = ?").get(id);
    res.status(201).json({ site });
  })
);

// DELETE /api/sites/:id - הסרת אתר מהמעקב (רק הבעלים)
router.delete(
  "/:id",
  ah(async (req, res) => {
    const site = await db
      .prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    // מוחקים קודם את הסריקות המשויכות (אין ON DELETE CASCADE ב-schema הנוכחי)
    await db.prepare("DELETE FROM scans WHERE site_id = ?").run(site.id);
    await db.prepare("DELETE FROM sites WHERE id = ?").run(site.id);

    res.json({ ok: true });
  })
);

// POST /api/sites/:id/verify-ownership - אימות בעלות על דומיין (סעיף 7.4 במפרט)
// MVP: אימות ידני/מיידי. בפרודקשן יש להחליף באימות אמיתי (רשומת DNS TXT / קובץ ייעודי בשורש
// האתר) לפני מתן גישה לבדיקות עומס מלאות/פנטסט אקטיבי.
router.post(
  "/:id/verify-ownership",
  ah(async (req, res) => {
    const site = await db
      .prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!site) return res.status(404).json({ error: "אתר לא נמצא" });

    await db.prepare("UPDATE sites SET ownership_verified = 1 WHERE id = ?").run(site.id);

    await db
      .prepare(
        "INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'ownership_verified', ?)"
      )
      .run(uuidv4(), req.user.id, `site=${site.url}`);

    const updated = await db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id);
    res.json({ site: updated });
  })
);

module.exports = router;
