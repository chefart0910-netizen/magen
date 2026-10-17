// MAGEN - איתור ממצאים "חדשים" בסריקה שהושלמה, לעומת הסריקה המלאה הקודמת מאותו סוג
// על אותו אתר (ראו lib/routes/scan-callback.js ו-lib/routes/scans.js, מסלול האבטחה).
// ==========================================================================================
// ההשוואה היא לפי מזהה הכלל/הממצא בלבד (v.id / finding.id), ולא שוויון אובייקטים מלא:
// nodes_affected וטקסטי עזר יכולים להשתנות בין סריקות של אותו עמוד בלי שהבעיה המדווחת
// השתנתה בפועל, וזה היה מציף התראות "חדש" על כל סריקה.
//
// סריקה ראשונה של אתר (אין סריקה קודמת מאותו סוג) לא מניבה "חדש" כלל - אין בסיס
// להשוואה, וכל הממצאים שלה הם ברירת המחדל של האתר, לא שינוי שקרה.

const db = require("../db");

function extractFindings(scanType, result) {
  if (!result) return [];
  if (scanType === "security_baseline") {
    return Array.isArray(result.findings)
      ? result.findings.map((f) => ({
          id: f.id,
          label: f.title || f.description || f.id,
          severity: f.severity || null,
        }))
      : [];
  }
  // lighthouse_axe - ממצאי נגישות (axe-core), ראו lib/services/scanner.js.
  if (Array.isArray(result?.accessibility?.violations)) {
    return result.accessibility.violations.map((v) => ({
      id: v.id,
      label: v.description || v.id,
      severity: v.impact || null,
    }));
  }
  return [];
}

// siteId/scanId/scanType/result - הסריקה שהושלמה כעת, לפני שהיא עצמה נכתבת כ"completed"
// (כך שהשאילתה למטה מוצאת בדיוק את הסריקה המלאה הקודמת, בלי לצטרך לסנן את עצמה).
async function findNewFindings(siteId, scanType, result) {
  const current = extractFindings(scanType, result);
  if (current.length === 0) return [];

  const previous = await db
    .prepare(
      `SELECT result_json FROM scans
       WHERE site_id = ? AND scan_type = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`
    )
    .get(siteId, scanType);

  if (!previous) return [];

  let prevResult;
  try {
    prevResult = previous.result_json ? JSON.parse(previous.result_json) : null;
  } catch {
    return [];
  }

  const prevIds = new Set(extractFindings(scanType, prevResult).map((f) => f.id));
  return current.filter((f) => !prevIds.has(f.id));
}

module.exports = { findNewFindings };
