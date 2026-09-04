// MAGEN - נקודת הכניסה שרצה בתוך GitHub Actions.
// ==========================================================================================
// מריצה את אותה runFullScan בדיוק כמו הפונקציה ב-Vercel, רק מול Chrome שמותקן על ה-runner
// (SCAN_RUNNER=local) ובלי תקרת 60 השניות. בסיום היא שולחת את התוצאה חזרה ל-MAGEN.
// כל הפרמטרים מגיעים דרך משתני סביבה - בכוונה, ולא כארגומנטים בשורת הפקודה: כתובת האתר
// מגיעה ממשתמש, ואסור שתגיע לשורת פקודה כלשהי.

const { runFullScan } = require("../lib/services/scanner");

const SCAN_ID = process.env.SCAN_ID;
const SCAN_URL = process.env.SCAN_URL;
const CALLBACK_URL = process.env.CALLBACK_URL;
const CALLBACK_SECRET = process.env.CALLBACK_SECRET;

async function report(payload) {
  if (!CALLBACK_URL || !CALLBACK_SECRET) {
    console.error("CALLBACK_URL / CALLBACK_SECRET חסרים - התוצאה לא נשלחה");
    return false;
  }
  const res = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-magen-scan-secret": CALLBACK_SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`שליחת התוצאה נכשלה: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

(async () => {
  if (!SCAN_ID || !SCAN_URL) {
    console.error("SCAN_ID / SCAN_URL חסרים");
    process.exit(1);
  }

  try {
    const result = await runFullScan(SCAN_URL);
    const ok = await report({ scan_id: SCAN_ID, result });
    process.exit(ok ? 0 : 1);
  } catch (err) {
    // גם כישלון מדווח חזרה - אחרת הסריקה נשארת תקועה ב"בבדיקה" לנצח.
    await report({ scan_id: SCAN_ID, error: String(err.message || err) });
    process.exit(1);
  }
})();
