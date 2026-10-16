// MAGEN - חיפוש אישי: מוצא אתרים וממצאי סריקה *של המשתמש המחובר בלבד* (סעיף "הכל" -
// חיפוש בסיסי לגרסת MVP). לא מחפש בין משתמשים - כל שורת SQL כאן מסוננת ל-user_id.
// ==========================================================================================
// למה LIKE ולא FTS: היקף הנתונים (אתרים וסריקות של לקוח בודד) קטן בהרבה מהיקף שבו
// FTS5 נותן יתרון אמיתי, וליבSQL/Turso לא בטוח שתומך ב-FTS5 בלי הגדרה נוספת. LIKE
// עם '%...%' לא מנצל אינדקס, אבל כאן הטבלה מסוננת ל-site_id-ים של משתמש אחד - סדר
// גודל של עשרות עד מאות שורות, לא אלפים.

const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ah } = require("../async-handler");

const router = express.Router();
router.use(requireAuth);

const MAX_RESULTS = 50;

function escapeLike(term) {
  // בריחה לתווי ה-wildcard של LIKE עצמם, כדי שחיפוש על "50%" לא יתנהג כאוסף תווים.
  return term.replace(/[%_]/g, (c) => `\\${c}`);
}

// GET /api/search?q=... - חיפוש בין האתרים של המשתמש ובין ממצאי הסריקות שלו.
router.get(
  "/",
  ah(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ sites: [], findings: [], query: q });
    }

    const like = `%${escapeLike(q)}%`;

    const sites = await db
      .prepare(
        `SELECT id, url, label, ownership_verified
         FROM sites
         WHERE user_id = ? AND (url LIKE ? ESCAPE '\\' OR label LIKE ? ESCAPE '\\')
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(req.user.id, like, like, MAX_RESULTS);

    // ממצאי סריקה: מחפשים בתוך result_json הגולמי (כולל rule id ותיאור הממצא, שנמצאים
    // בתוכו כטקסט). מדויק מספיק ל-MVP; דוח מלא פר-ממצא ידרוש טבלת findings נפרדת.
    const scanRows = await db
      .prepare(
        `SELECT scans.id as scan_id, scans.site_id, scans.scan_type, scans.created_at, scans.result_json, sites.url as site_url
         FROM scans
         JOIN sites ON sites.id = scans.site_id
         WHERE sites.user_id = ? AND scans.status = 'completed' AND scans.result_json LIKE ? ESCAPE '\\'
         ORDER BY scans.created_at DESC
         LIMIT ?`
      )
      .all(req.user.id, like, MAX_RESULTS);

    // לכל שורה שעלתה מה-LIKE, שולפים מה-JSON את הממצא הספציפי שבאמת תאם (ולא רק
    // "משהו ב-JSON תאם") - כדי שתוצאת החיפוש תראה מה בדיוק נמצא, ולא רק קישור לסריקה.
    const qLower = q.toLowerCase();
    const findings = [];
    for (const row of scanRows) {
      if (findings.length >= MAX_RESULTS) break;
      let result;
      try {
        result = JSON.parse(row.result_json || "null");
      } catch {
        continue;
      }
      const violations = result?.accessibility?.violations || [];
      const securityFindings = result?.findings || result?.security?.findings || [];
      const candidates = [...violations, ...securityFindings];

      for (const v of candidates) {
        const haystack = `${v.id || ""} ${v.description || ""} ${v.help || ""} ${v.title || ""}`.toLowerCase();
        if (haystack.includes(qLower)) {
          findings.push({
            scan_id: row.scan_id,
            site_id: row.site_id,
            site_url: row.site_url,
            scan_type: row.scan_type,
            created_at: row.created_at,
            rule_id: v.id || null,
            title: v.help || v.title || v.description || v.id,
          });
          if (findings.length >= MAX_RESULTS) break;
        }
      }
    }

    res.json({ sites, findings, query: q });
  })
);

module.exports = router;
