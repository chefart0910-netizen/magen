// MAGEN - אינטגרציית OWASP ZAP אמיתית (baseline scan: spider + סריקה פסיבית בלבד).
// ==========================================================================================
// חשוב: זו סריקה פסיבית/baseline - לא תקיפה אקטיבית. ZAP רק "קורא" ומנתח תעבורה שהוא עצמו
// יוצר בגלישה רגילה באתר (spider), ומחפש דפוסים בעייתיים בתשובות (headers חסרים, cookies לא
// מאובטחים וכו'). זה שקול לחלוטין למה ש-`zap-baseline.py` הרשמי של ZAP עושה, ואין כאן שום
// ניצול פרצות (exploitation) בפועל - בדיוק כמו axe-core/Lighthouse, רק בשביל אבטחה.
//
// דורש קונטיינר ZAP רץ במצב daemon עם ה-API מופעל, למשל:
//   docker run -d -p 8080:8080 zaproxy/zap-stable zap.sh -daemon -host 0.0.0.0 -port 8080 -config api.disablekey=true
//
// תצורה דרך משתני סביבה (ראו .env.example):
//   ZAP_API_URL - כתובת ה-API של ZAP (ברירת מחדל: http://localhost:8080)
//   ZAP_API_KEY - מפתח API אם לא הושבת (api.disablekey=true פוטר מזה)

const ZAP_API_URL = (process.env.ZAP_API_URL || "http://localhost:8080").replace(/\/$/, "");
const ZAP_API_KEY = process.env.ZAP_API_KEY || "";

const SEVERITY_BY_RISK = { High: "critical", Medium: "serious", Low: "moderate", Informational: "minor" };

async function zapGet(path, params = {}) {
  const url = new URL(ZAP_API_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (ZAP_API_KEY) url.searchParams.set("apikey", ZAP_API_KEY);

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new Error(
      `לא ניתן להתחבר ל-ZAP ב-${ZAP_API_URL}. ודא שקונטיינר ה-Docker רץ (ראו services/zap-scan.js לפקודה). ` +
      `שגיאה: ${err.message}`
    );
  }
  if (!res.ok) throw new Error(`ZAP API החזיר ${res.status} עבור ${path}`);
  return res.json();
}

// הבדיקה הזו רצה *בתוך* בקשת HTTP, ולפונקציה ב-Vercel יש תקרה של 60 שניות (vercel.json).
// spider של 90 שניות + סריקה פסיבית של 60 היו חורגים ממנה בוודאות: הפונקציה נהרגת,
// המשתמש מקבל 504, והשורה במסד נשארת "רצה". התקציבים כאן נקבעו כך שסך הכל נשאר
// בתוך התקרה עם מרווח לשאר העבודה.
async function waitFor(checkFn, { intervalMs = 1500, timeoutMs = 20000, label = "פעולה" } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const done = await checkFn();
    if (done) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${label} לא הסתיימה תוך ${Math.round(timeoutMs / 1000)} שניות (timeout)`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function runZapBaselineScan(url) {
  // 1. ניקוי הקשר קודם (session חדש) כדי שסריקות לא "ידממו" זו לתוך זו.
  await zapGet("/JSON/core/action/newSession/", { name: "magen", overwrite: "true" });

  // 2. Spider - גלישה רגילה (לא אקטיבית) לגילוי דפים ותשתית האתר.
  const spiderStart = await zapGet("/JSON/spider/action/scan/", { url, maxChildren: "10" });
  const spiderScanId = spiderStart.scan;
  await waitFor(
    async () => {
      const status = await zapGet("/JSON/spider/view/status/", { scanId: spiderScanId });
      return Number(status.status) >= 100;
    },
    { label: "סריקת Spider", timeoutMs: 20000 }
  );

  // 3. סריקה פסיבית - ZAP מנתח אוטומטית כל תעבורה שנאספה ע"י ה-spider. ממתינים שהתור יתרוקן.
  await waitFor(
    async () => {
      const status = await zapGet("/JSON/pscan/view/recordsToScan/");
      return Number(status.recordsToScan) === 0;
    },
    { label: "סריקה פסיבית", timeoutMs: 15000 }
  );

  // 4. שליפת ממצאים.
  const alertsResult = await zapGet("/JSON/core/view/alerts/", { baseurl: url });
  const alerts = alertsResult.alerts || [];

  const violations = alerts.map((a) => ({
    id: a.pluginId,
    name: a.name,
    risk: a.risk,
    severity: SEVERITY_BY_RISK[a.risk] || "moderate",
    description: a.description,
    solution: a.solution,
    reference: a.reference,
    url: a.url,
    cwe_id: a.cweid,
  }));

  const weights = { critical: 12, serious: 7, moderate: 3, minor: 1 };
  const penalty = violations.reduce((sum, v) => sum + (weights[v.severity] || 2), 0);
  const computed_score = Math.max(0, Math.round(100 - penalty));

  return {
    url,
    scanned_at: new Date().toISOString(),
    scan_type: "zap_baseline",
    computed_score,
    violations_count: violations.length,
    violations,
  };
}

module.exports = { runZapBaselineScan };
