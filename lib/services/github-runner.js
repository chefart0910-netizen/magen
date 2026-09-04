// MAGEN - הפעלת סריקה על runner של GitHub Actions.
// ==========================================================================================
// למה בכלל: פונקציית Vercel מוגבלת ל-60 שניות (המקסימום בתוכנית Hobby), ואתר וורדפרס
// ממוצע עם כמה תוספים חורג מזה בבדיקת Lighthouse מלאה. ל-runner של GitHub אין מגבלה כזו,
// יש עליו Chrome מותקן, ולכן הוא גם מייתר את Browserless לגמרי.
//
// משתני הסביבה הנדרשים ב-Vercel:
//   GITHUB_DISPATCH_TOKEN - טוקן GitHub עם הרשאת Actions: read and write על הריפו בלבד
//   GITHUB_REPO           - בפורמט owner/repo
//   SCAN_CALLBACK_SECRET  - סוד משותף שבו ה-runner מזדהה כשהוא מחזיר תוצאה
// כל עוד אחד מהם חסר, המערכת ממשיכה לרוץ בנתיב הסינכרוני הישן.

const GITHUB_API = "https://api.github.com";
const WORKFLOW_FILE = process.env.GITHUB_SCAN_WORKFLOW || "scan.yml";
const WORKFLOW_REF = process.env.GITHUB_SCAN_REF || "main";

function isRunnerConfigured() {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN &&
      process.env.GITHUB_REPO &&
      process.env.SCAN_CALLBACK_SECRET
  );
}

async function dispatchScanRun({ scanId, url }) {
  const repo = process.env.GITHUB_REPO;
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "magen-scanner",
      },
      body: JSON.stringify({
        ref: WORKFLOW_REF,
        inputs: { scan_id: String(scanId), url: String(url) },
      }),
    }
  );

  // GitHub מחזיר 204 בלי גוף כשההפעלה הצליחה.
  if (res.status !== 204) {
    const body = await res.text().catch(() => "");
    throw new Error(`הפעלת הסריקה ב-GitHub Actions נכשלה (${res.status}): ${body.slice(0, 300)}`);
  }
  return true;
}

module.exports = { isRunnerConfigured, dispatchScanRun };
