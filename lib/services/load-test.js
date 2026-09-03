// MAGEN - הרצת בדיקת עומס מלאה אמיתית עם k6 (סעיף 2.1 במפרט)
// דורש: k6 מותקן ונגיש דרך PATH (ראו README - הוראות התקנה).
// מריץ כתהליך child process נפרד, קורא את סיכום ה-JSON, ומחזיר מדדים מובנים.

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const K6_SCRIPT_PATH = path.join(__dirname, "..", "..", "k6-scripts", "load-test.js");

// PATH של Windows מתעדכן ברמת המערכת ע"י מתקין ה-MSI, אבל תהליכים שכבר רצים (טרמינל פתוח,
// שרת Node שכבר עלה) לא "רואים" את זה עד שהתהליך עצמו נפתח מחדש - זו הסיבה השכיחה ביותר
// ל"k6 not found" גם כשk6 כן מותקן. לכן מנסים כמה נתיבים סבירים כ-fallback לפני שנכשלים,
// וגם מאפשרים override מפורש דרך משתנה הסביבה K6_BIN (למשל ב-.env) למקרה שההתקנה במיקום חריג.
const K6_CANDIDATES = [
  process.env.K6_BIN,
  "k6",
  ...(process.platform === "win32"
    ? [
        "C:\\Program Files\\k6\\k6.exe",
        path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "k6.exe"),
        path.join(os.homedir(), "scoop", "shims", "k6.exe"),
        "C:\\ProgramData\\chocolatey\\bin\\k6.exe",
      ]
    : []),
].filter(Boolean);

// בדיקה חד-פעמית שק6 בכלל מותקן ונגיש, ומחזירה את הנתיב/פקודה שעבד (כדי שהרצת הבדיקה
// עצמה לא תצטרך לנחש שוב) - כדי לתת הודעת שגיאה ברורה במקום קריסה מבלבלת.
function tryK6Bin(bin) {
  return new Promise((resolve) => {
    const proc = spawn(bin, ["version"]);
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

async function resolveK6Bin() {
  for (const bin of K6_CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    if (await tryK6Bin(bin)) return bin;
  }
  return null;
}

async function runFullLoadTest(url, { virtualUsers = 50, durationSeconds = 30 } = {}) {
  const k6Bin = await resolveK6Bin();
  if (!k6Bin) {
    throw new Error(
      "k6 אינו מותקן או לא נגיש דרך PATH. אם k6 כבר מותקן: סגור לגמרי את חלון הטרמינל של " +
      "השרת (לא רק Ctrl+C) ופתח אותו מחדש כדי שיטען PATH מעודכן, או קבע נתיב מפורש במשתנה " +
      "הסביבה K6_BIN. אחרת התקן מ-https://k6.io/docs/getting-started/installation."
    );
  }

  // הגבלות סבירות כדי למנוע שימוש לרעה (גם עם אימות בעלות - סעיף 7.4 במפרט)
  const vus = Math.min(Math.max(parseInt(virtualUsers, 10) || 50, 1), 2000);
  const duration = Math.min(Math.max(parseInt(durationSeconds, 10) || 30, 10), 300);

  const summaryPath = path.join(os.tmpdir(), `magen-k6-summary-${Date.now()}.json`);

  return new Promise((resolve, reject) => {
    const proc = spawn(k6Bin, [
      "run",
      "--quiet",
      `--summary-export=${summaryPath}`,
      K6_SCRIPT_PATH,
    ], {
      env: {
        ...process.env,
        TARGET_URL: url,
        MAX_VUS: String(vus),
        DURATION_SECONDS: String(duration),
      },
    });

    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("error", (err) => reject(new Error(`הרצת k6 נכשלה: ${err.message}`)));

    proc.on("exit", () => {
      // k6 יכול לצאת עם קוד שגיאה גם כשה-thresholds "נכשלו" (חלק מהבקשות נכשלו תחת עומס -
      // זו תוצאה לגיטימית של בדיקת עומס, לא כשל בהרצה עצמה), אז בודקים לפי קיום קובץ הסיכום.
      if (!fs.existsSync(summaryPath)) {
        return reject(new Error(`k6 לא הפיק קובץ סיכום. פלט שגיאה: ${stderr.slice(0, 500)}`));
      }

      try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
        fs.unlinkSync(summaryPath); // ניקוי קובץ זמני

        const metrics = summary.metrics || {};
        const httpReqs = metrics.http_reqs || {};
        const httpDuration = metrics.http_req_duration || {};
        const httpFailed = metrics.http_req_failed || {};
        const vusMax = metrics.vus_max?.value ?? metrics.vus_max?.max ?? vus;

        resolve({
          target_url: url,
          virtual_users_requested: vus,
          virtual_users_reached: vusMax,
          duration_seconds: duration,
          total_requests: httpReqs.count ?? 0,
          requests_per_second: httpReqs.rate ? Math.round(httpReqs.rate * 100) / 100 : null,
          latency_ms: {
            avg: round(httpDuration.avg),
            p95: round(httpDuration["p(95)"]),
            p99: round(httpDuration["p(99)"]),
            max: round(httpDuration.max),
          },
          error_rate_percent: httpFailed.value != null ? Math.round(httpFailed.value * 10000) / 100 : null,
        });
      } catch (err) {
        reject(new Error(`שגיאה בקריאת תוצאות k6: ${err.message}`));
      }
    });
  });
}

function round(n) {
  return typeof n === "number" ? Math.round(n * 10) / 10 : null;
}

module.exports = { runFullLoadTest };
