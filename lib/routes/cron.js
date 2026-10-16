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
const { checkSiteHealth } = require("../services/monitor");
const { notifySiteEvent } = require("../services/alerts");

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


// SSL-expiry מתריעים פעם ליום לכל היותר, לא בכל ריצה (שיכולה לקרות כל 15-30 דקות) -
// אחרת אותה הודעה "התעודה פגה בעוד 10 ימים" היתה מגיעה עשרות פעמים ביום.
const SSL_ALERT_DAYS = 14;
const SSL_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// כמה כשלים רצופים לפני שמדווחים "האתר למטה" - בדיקת HTTP בודדת יכולה להיכשל מרשת
// חולפת, ואין טעם להבהיל משתמש על כשל של כמה שניות.
const DOWN_AFTER_FAILURES = 2;
const MAX_MONITOR_PER_RUN = 100;

// POST /api/cron/monitor-checks - בדיקת זמינות + תוקף SSL לכל האתרים, הרבה יותר תדירה
// מהסריקה המלאה (lighthouse/axe). מריץ workflow נפרד (.github/workflows/monitor-checks.yml)
// כדי שהתדירות של השעון הזה לא תלויה בתדירות הסריקה המתוזמנת.
router.post(
  "/monitor-checks",
  ah(async (req, res) => {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      console.error("CRON_SECRET אינו מוגדר - נתיב בדיקות הזמינות מושבת");
      return res.status(503).json({
        error: "CRON_SECRET אינו מוגדר בהגדרות הפרויקט. בדיקות הזמינות מושבתות.",
      });
    }
    if (!secretMatches(req.headers["x-cron-secret"] || "", expected)) {
      return res.status(401).json({ error: "סוד לא תקין" });
    }

    await db.ensureReady();

    const sites = await db
      .prepare(
        `SELECT sites.id, sites.url, sites.user_id,
                site_status.is_up as prev_is_up, site_status.ssl_days_remaining as prev_ssl_days,
                site_status.consecutive_failures as prev_failures, site_status.last_alert_sent_at
         FROM sites
         LEFT JOIN site_status ON site_status.site_id = sites.id
         ORDER BY sites.created_at ASC
         LIMIT ?`
      )
      .all(MAX_MONITOR_PER_RUN);

    const checked = [];
    const alerted = [];

    for (const site of sites) {
      let health;
      try {
        health = await checkSiteHealth(site.url);
      } catch (err) {
        console.error("בדיקת זמינות נכשלה:", site.url, err?.message || err);
        continue;
      }

      const prevFailures = site.prev_failures || 0;
      const consecutiveFailures = health.http.isUp ? 0 : prevFailures + 1;
      // 'is_up' הנשמר הוא רק אחרי הסף - כדי שהתראת "למטה" לא תישלח על כשל בודד חולף,
      // אבל מצב "עולה" לפני הסף עדיין לא נחשב "נפל" כלפי המשתמש.
      const isUpForAlerting = consecutiveFailures < DOWN_AFTER_FAILURES;

      await db
        .prepare(
          `INSERT INTO site_status (site_id, is_up, last_checked_at, last_status_code, response_time_ms, ssl_valid_to, ssl_days_remaining, consecutive_failures)
           VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)
           ON CONFLICT(site_id) DO UPDATE SET
             is_up = excluded.is_up, last_checked_at = excluded.last_checked_at,
             last_status_code = excluded.last_status_code, response_time_ms = excluded.response_time_ms,
             ssl_valid_to = excluded.ssl_valid_to, ssl_days_remaining = excluded.ssl_days_remaining,
             consecutive_failures = excluded.consecutive_failures`
        )
        .run(
          site.id,
          isUpForAlerting ? 1 : 0,
          health.http.statusCode,
          health.http.responseTimeMs,
          health.ssl.validTo,
          health.ssl.daysRemaining,
          consecutiveFailures
        );

      checked.push(site.url);

      // --- זיהוי שינוי מצב ושליחת התראה ----------------------------------------------
      const events = [];
      const wasUp = site.prev_is_up === null || site.prev_is_up === undefined ? true : !!site.prev_is_up;

      if (wasUp && !isUpForAlerting) {
        events.push({ type: "down", statusCode: health.http.statusCode });
      } else if (!wasUp && isUpForAlerting) {
        events.push({ type: "up" });
      }

      if (
        health.ssl.daysRemaining !== null &&
        health.ssl.daysRemaining <= SSL_ALERT_DAYS &&
        health.ssl.daysRemaining >= 0
      ) {
        const lastAlert = site.last_alert_sent_at
          ? new Date(String(site.last_alert_sent_at).replace(" ", "T") + "Z").getTime()
          : 0;
        if (Date.now() - lastAlert >= SSL_ALERT_COOLDOWN_MS) {
          events.push({ type: "ssl_expiring", daysRemaining: health.ssl.daysRemaining, validTo: health.ssl.validTo });
        }
      }

      if (events.length === 0) continue;

      const user = await db
        .prepare("SELECT id, email, plan, webhook_url, alerts_email_enabled, alerts_webhook_enabled FROM users WHERE id = ?")
        .get(site.user_id);
      if (!user) continue;

      let sslAlerted = false;
      for (const event of events) {
        try {
          await notifySiteEvent(user, site, event);
          alerted.push({ site: site.url, type: event.type });
          if (event.type === "ssl_expiring") sslAlerted = true;
        } catch (err) {
          console.error("שליחת התראה נכשלה:", site.url, event.type, err?.message || err);
        }
      }

      // רק התראת SSL צריכה "קירור" - down/up מדווחים על כל שינוי מצב, לא לפי שעון.
      if (sslAlerted) {
        await db.prepare("UPDATE site_status SET last_alert_sent_at = datetime('now') WHERE site_id = ?").run(site.id);
      }
    }

    res.json({ checked: checked.length, alerted: alerted.length, events: alerted });
  })
);

module.exports = router;
