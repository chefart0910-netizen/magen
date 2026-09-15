// MAGEN - הפעלת סריקה בסיסית על ה-runner, במקום אחד.
// ==========================================================================================
// למה מודול נפרד: את אותה הפעלה צריכים שני קוראים - המשתמש שלוחץ "בדיקה בסיסית"
// (routes/scans.js) והתזמון האוטומטי (routes/cron.js). שני עותקים של הלוגיקה הזו היו
// נפרדים ברגע שמשנים משהו באחד מהם.

const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { isRunnerConfigured, dispatchScanRun } = require("./github-runner");

// ל-workflow יש timeout של 15 דקות. סריקה שעברה את זה ועדיין "רצה" לא תחזור לעולם -
// היא נשארה תלויה בגלל כשל שקרה לפני שה-reporter הספיק לדווח. סוגרים אותה כדי שההיסטוריה
// לא תתמלא בשורות זומבי.
async function sweepStuckScans(siteId) {
  await db
    .prepare(
      `UPDATE scans SET status = 'failed', completed_at = datetime('now'),
       result_json = '{"error":"הסריקה לא הסתיימה בזמן ולא התקבלה ממנה תוצאה"}'
       WHERE site_id = ? AND status = 'running'
         AND created_at < datetime('now', '-15 minutes')`
    )
    .run(siteId);
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

module.exports = { startAsyncScan, sweepStuckScans };
