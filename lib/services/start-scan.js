// MAGEN - הפעלת סריקה בסיסית על ה-runner, במקום אחד.
// ==========================================================================================
// למה מודול נפרד: את אותה הפעלה צריכים שני קוראים - המשתמש שלוחץ "בדיקה בסיסית"
// (routes/scans.js) והתזמון האוטומטי (routes/cron.js). שני עותקים של הלוגיקה הזו היו
// נפרדים ברגע שמשנים משהו באחד מהם.

const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { isRunnerConfigured, dispatchScanRun } = require("./github-runner");

// כמה זמן לתת לסריקה לפני שמכריזים עליה מתה.
//
// היה כאן 15 דקות, וזה היה שגוי: ה-timeout של 15 דקות ב-workflow נמדד מהרגע שה-job
// *מתחיל*, בעוד created_at נרשם ברגע השליחה. בין השניים יש תור של GitHub (שניות עד
// דקות ארוכות) ועוד checkout + npm install. כלומר סריקה שרצה כשורה סומנה "נכשלה",
// והמשתמש ראה כישלון שקרי - ואז התוצאה האמיתית הגיעה וסתרה אותו. הסף חייב להיות
// גדול מ"תור + timeout", ולכן 30 דקות.
const STUCK_AFTER_MINUTES = 30;

// 'queued' היא ברירת המחדל בסכימה. היא לא היתה בתנאי, כך ששורה שנפתחה כ-queued לא
// היתה נסגרת אף פעם.
async function sweepStuckScans(siteId) {
  await db
    .prepare(
      `UPDATE scans SET status = 'failed', completed_at = datetime('now'),
       result_json = '{"error":"הסריקה לא הסתיימה בזמן ולא התקבלה ממנה תוצאה"}'
       WHERE site_id = ? AND status IN ('running','queued')
         AND created_at < datetime('now', '-${STUCK_AFTER_MINUTES} minutes')`
    )
    .run(siteId);
}

// אותו דבר, בלי הגבלה לאתר מסוים. בלי זה, סריקה שנתקעה באתר שאף אחד לא חוזר אליו
// נשארת "רצה" לנצח - ומצטברת בסטטיסטיקות הבק-אופיס.
async function sweepAllStuckScans() {
  const result = await db
    .prepare(
      `UPDATE scans SET status = 'failed', completed_at = datetime('now'),
       result_json = '{"error":"הסריקה לא הסתיימה בזמן ולא התקבלה ממנה תוצאה"}'
       WHERE status IN ('running','queued')
         AND created_at < datetime('now', '-${STUCK_AFTER_MINUTES} minutes')`
    )
    .run();
  return result.changes || 0;
}

// פותח שורת סריקה ושולח את העבודה ל-runner. מחזיר את מזהה הסריקה, או זורק שגיאה
// אחרי שסימן את השורה ככשל - כדי שלא תישאר "רצה" בלי שאף אחד בדרך אליה.
async function startAsyncScan(site) {
  if (!isRunnerConfigured()) {
    const err = new Error("שרת הבדיקות אינו מוגדר (חסרים סודות ה-runner)");
    err.code = "NO_RUNNER";
    throw err;
  }

  const scanId = uuidv4();
  await db
    .prepare("INSERT INTO scans (id, site_id, scan_type, status) VALUES (?, ?, 'lighthouse_axe', 'running')")
    .run(scanId, site.id);

  try {
    await dispatchScanRun({ scanId, url: site.url });
    return scanId;
  } catch (err) {
    await db
      .prepare("UPDATE scans SET status = 'failed', result_json = ? WHERE id = ?")
      .run(JSON.stringify({ error: String(err.message || err) }), scanId);
    throw err;
  }
}

module.exports = { startAsyncScan, sweepStuckScans, sweepAllStuckScans, STUCK_AFTER_MINUTES };
