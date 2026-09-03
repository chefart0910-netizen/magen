// עזרי תצוגה משותפים - MAGEN frontend

export function scoreClass(score) {
  if (score === null || score === undefined) return "";
  if (score >= 90) return "score-good";
  if (score >= 50) return "score-mid";
  return "score-bad";
}

export function formatDate(isoOrSqlite) {
  if (!isoOrSqlite) return "-";
  // SQLite datetime('now') מחזיר "YYYY-MM-DD HH:MM:SS" ללא אזור זמן - נתייחס אליו כ-UTC
  const normalized = isoOrSqlite.includes("T") ? isoOrSqlite : isoOrSqlite.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return isoOrSqlite;
  return d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

export const SCAN_TYPE_LABELS = {
  lighthouse_axe: "בדיקה בסיסית (ביצועים + נגישות)",
  security_baseline: "בדיקת אבטחה (ZAP)",
  full_load: "בדיקת עומס מלאה",
  active_pentest: "פנטסט אקטיבי",
};

export const STATUS_LABELS = {
  queued: "בתור",
  running: "רץ",
  completed: "הושלם",
  failed: "נכשל",
};

export const IMPACT_LABELS = {
  minor: "קל",
  moderate: "בינוני",
  serious: "חמור",
  critical: "קריטי",
};
