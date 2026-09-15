// MAGEN - קליטת תוצאת סריקה מ-GitHub Actions.
// ==========================================================================================
// זה הנתיב היחיד ב-API שאינו מאחורי requireAuth, כי מי שקורא לו הוא ה-runner ולא משתמש
// מחובר. הוא מוגן בסוד משותף (SCAN_CALLBACK_SECRET) שמושווה בהשוואה בזמן קבוע, וכל מה
// שהוא מרשה לעשות הוא לעדכן רשומת סריקה קיימת - אי אפשר ליצור דרכו נתונים חדשים.

const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { toPartialReport } = require("../services/scanner");
const { ah } = require("../async-handler");

const router = express.Router();

// השוואה בזמן קבוע: השוואת מחרוזות רגילה מדליפה כמה תווים התאימו, ומאפשרת לנחש את
// הסוד תו אחר תו לפי זמני התגובה.
function secretMatches(provided) {
  const expected = process.env.SCAN_CALLBACK_SECRET || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post(
  "/",
  ah(async (req, res) => {
    if (!secretMatches(req.get("x-magen-scan-secret"))) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { scan_id: scanId, result, error } = req.body || {};
    if (!scanId) return res.status(400).json({ error: "scan_id חסר" });

    await db.ensureReady();
    const scan = await db.prepare("SELECT * FROM scans WHERE id = ?").get(scanId);
    if (!scan) return res.status(404).json({ error: "בדיקה לא נמצאה" });

    // דיווח כשל *לא* מוחק תוצאה שהושלמה. התרחיש שהתיקון הזה מונע: ה-runner שלח את
    // התוצאה, השרת שמר אותה, אבל התשובה אבדה בדרך חזרה (קור-סטארט, ניתוק). ה-runner
    // ראה את זה ככשל, נפל, ואז שלב "Report failure" ב-workflow שלח שגיאה לאותו scan_id -
    // וכתב אותה מעל דוח תקין שכבר היה במסד. בדיקה אחת של הסטטוס פותרת את כל השרשרת.
    if (error || !result) {
      const update = await db
        .prepare(
          `UPDATE scans SET status = 'failed', result_json = ?, completed_at = datetime('now')
           WHERE id = ? AND status <> 'completed'`
        )
        .run(JSON.stringify({ error: String(error || "הסריקה לא החזירה תוצאה") }), scanId);
      if (!update.changes) {
        return res.json({ ok: true, status: "completed", ignored: "already_completed" });
      }
      return res.json({ ok: true, status: "failed" });
    }

    // הגבלת הדוח לחבילה החינמית נעשית כאן ולא ב-runner: ה-runner לא אמור להכיר את מודל
    // החבילות, ומי שמחליט מה המשתמש רואה הוא השרת.
    const owner = await db
      .prepare(
        "SELECT users.plan FROM sites JOIN users ON users.id = sites.user_id WHERE sites.id = ?"
      )
      .get(scan.site_id);
    const stored = owner && owner.plan === "free" ? toPartialReport(result) : result;

    // תוצאה אמיתית גוברת גם על שורה שסומנה "נכשלה" על ידי המטאטא (סריקה שאיחרה),
    // אבל משלוח חוזר של אותה תוצאה לא מזיז את completed_at.
    await db
      .prepare(
        `UPDATE scans SET status = 'completed', result_json = ?,
         completed_at = COALESCE(completed_at, datetime('now')),
         score_performance = ?, score_accessibility = ?, score_seo = ? WHERE id = ?`
      )
      .run(
        JSON.stringify(stored),
        stored.lighthouse?.performance ?? null,
        stored.accessibility?.computed_score ?? null,
        stored.lighthouse?.seo ?? null,
        scanId
      );

    res.json({ ok: true, status: "completed" });
  })
);

module.exports = router;
