// MAGEN - סריקות מתוזמנות.
// ==========================================================================================
// למה זה קיים: בדיקה חד-פעמית היא שירות שמשלמים עליו פעם אחת. "תגיד לי כשמשהו נשבר"
// הוא מנוי. זה המנגנון שהופך לקוח לתשלום חוזר.
//
// מי מפעיל: workflow ב-GitHub Actions (.github/workflows/scheduled-scans.yml) שרץ פעם
// ביום ומבקש את הנתיב הזה. לא נבחר cron של Vercel כי לא נבדק מה מגבלות התוכנית, ובעיקר
// כי תשתית ה-Actions כבר עובדת כאן, בחינם, ובכל תדירות.
//
// אבטחה: הנתיב פתוח (אין משתמש מחובר ב-cron), ולכן הוא דורש סוד משותף בכותרת. אם הסוד
// אינו מוגדר בסביבה - הנתיב מחזיר 503 ואומר את זה במפורש, במקום להיות פתוח בשקט. זה
// בדיוק הלקח מהסודות של ה-runner שלא נשמרו ושלושה ימים נראו כמו "הסריקה תקועה".

const express = require("express");
const crypto = require("node:crypto");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { ah } = require("../async-handler");
const { isRunnerConfigured } = require("../services/github-runner");
const { startAsyncScan, sweepStuckScans, sweepAllStuckScans } = require("../services/start-scan");

const router = express.Router();

// כל כמה ימים נחשב "הגיע הזמן".
const INTERVAL_DAYS = { weekly: 7, monthly: 30 };

// חלון סובלנות. בלעדיו התזמון "שבועי" רץ בפועל כל שמונה ימים: ה-workflow נורה בשעה
// קבועה, אבל last_scheduled_scan_at נרשם כמה שניות *אחרי* הירייה של השבוע הקודם, ולכן
// בהרצה של יום 7 חסרות כמה שניות למלאות שבעה ימים - לא "הגיע לו" - והוא נדחה ליום 8.
// וכך בכל מחזור. חצי יום סובלנות מבטל את הזחילה ולא מאפשר שתי סריקות באותו יום.
const DUE_TOLERANCE_MS = 12 * 60 * 60 * 1000;

// תקרה להרצה אחת: כל סריקה היא ריצה של GitHub Actions, ואין סיבה להציף את התור או
// לשרוף את מכסת הדקות בגלל יום אחד שבו הצטברו הרבה אתרים. מה שלא נכנס - ייסרק מחר.
const MAX_PER_RUN = 5;

function secretMatches(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  // אורך שונה כבר מסגיר את התשובה, ולכן בודקים אותו בנפרד ואז השוואה בזמן קבוע.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// POST /api/cron/scheduled-scans
router.post(
  "/scheduled-scans",
  ah(async (req, res) => {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      console.error("CRON_SECRET אינו מוגדר - הנתיב לסריקות מתוזמנות מושבת");
      return res.status(503).json({
        error: "CRON_SECRET אינו מוגדר בהגדרות הפרויקט. הסריקות המתוזמנות מושבתות.",
      });
    }
    if (!secretMatches(req.headers["x-cron-secret"] || "", expected)) {
      return res.status(401).json({ error: "סוד לא תקין" });
    }

    // נתיב ציבורי - אין requireAuth שיריץ את המיגרציות במקומנו.
    await db.ensureReady();

    if (!isRunnerConfigured()) {
      console.error("סריקות מתוזמנות: שרת הבדיקות אינו מוגדר");
      return res.status(503).json({ error: "שרת הבדיקות אינו מוגדר" });
    }

    // ההרצה היומית היא גם ההזדמנות היחידה לנקות שורות שנתקעו באתרים שאף אחד לא נכנס
    // אליהם. בלי זה הן נשארות "רצות" לנצח.
    let sweptStuck = 0;
    try {
      sweptStuck = await sweepAllStuckScans();
    } catch (err) {
      console.error("ניקוי סריקות תקועות נכשל:", err?.message || err);
    }

    const sites = await db
      .prepare(
        `SELECT id, url, user_id, scan_schedule, last_scheduled_scan_at
         FROM sites
         WHERE scan_schedule IN ('weekly','monthly')
         ORDER BY COALESCE(last_scheduled_scan_at, '1970-01-01') ASC`
      )
      .all();

    const now = Date.now();
    const due = sites.filter((s) => {
      const days = INTERVAL_DAYS[s.scan_schedule];
      if (!days) return false;
      if (!s.last_scheduled_scan_at) return true;
      const last = new Date(String(s.last_scheduled_scan_at).replace(" ", "T") + "Z").getTime();
      if (Number.isNaN(last)) return true;
      return now - last >= days * 24 * 60 * 60 * 1000 - DUE_TOLERANCE_MS;
    });

    const started = [];
    const failed = [];
    const selected = due.slice(0, MAX_PER_RUN);

    for (const site of selected) {
      let scanId;
      try {
        await sweepStuckScans(site.id);
        scanId = await startAsyncScan(site);
      } catch (err) {
        // כשל באתר אחד לא עוצר את השאר.
        console.error("סריקה מתוזמנת נכשלה:", site.url, err?.message || err);
        failed.push({ site: site.url, error: String(err?.message || err) });
        continue;
      }

      // הסריקה *כבר* רצה. אם רק רישום היומן או עדכון התאריך נכשל, זו לא סריקה שנכשלה,
      // ולכן ה-try הזה נפרד: קודם היה try אחד סביב שלושת הפעולות, וכשל בשורת היומן
      // דיווח על סריקה תקינה כאילו נכשלה.
      started.push({ site: site.url, scan_id: scanId });
      try {
        await db
          .prepare("UPDATE sites SET last_scheduled_scan_at = datetime('now') WHERE id = ?")
          .run(site.id);
        await db
          .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, 'scheduled_scan', ?)")
          .run(uuidv4(), site.user_id, `site=${site.url} scan=${scanId} schedule=${site.scan_schedule}`);
      } catch (err) {
        console.error("סריקה מתוזמנת הופעלה אך הרישום נכשל:", site.url, err?.message || err);
      }
    }

    res.json({
      checked: sites.length,
      due: due.length,
      started: started.length,
      // מה שנשאר בתור בפועל, ולא הפרש מהתקרה: אתרים שנכשלו ייבדקו שוב מחר גם הם.
      deferred: Math.max(0, due.length - selected.length) + failed.length,
      swept_stuck: sweptStuck,
      failed,
    });
  })
);

module.exports = router;
