// MAGEN - אסימוני איפוס סיסמה.
// ==========================================================================================
// מה נשמר במסד: רק SHA-256 של האסימון, לא האסימון עצמו. מי שמשיג קריאה לטבלה (גיבוי שדלף,
// יומן שאילתות, באג SQL) לא יכול לאפס בעזרתה סיסמה של אף אחד. גיבוב פשוט ולא bcrypt
// בכוונה: האסימון הוא 256 ביט אקראיים, אין מה לנחש, ו-bcrypt רק היה מאט כל בקשה.
//
// הכללים:
//   - תוקף של שעה.
//   - חד-פעמי: הצריכה היא UPDATE מותנה ב-used_at IS NULL, כך ששתי בקשות במקביל עם אותו
//     אסימון לא יכולות להצליח שתיהן.
//   - אסימון חדש מבטל את כל הקודמים של אותו משתמש - רק הקישור האחרון שנשלח עובד.
//   - איפוס מוצלח מעלה את users.token_version, וכל JWT שנחתם לפני כן נדחה ב-requireAuth.
//     זה "ביטול כל הסשנים": אם מישהו גנב את הסיסמה ונכנס, האיפוס מוציא אותו.

const crypto = require("node:crypto");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

const TOKEN_TTL_MINUTES = 60;

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

// הקישור שנשלח למשתמש. האסימון יושב אחרי "#" ולא ב-query string: החלק הזה לא נשלח לשרת
// בכלל, לא נכתב ליומני הגישה של Vercel, ולא דולף ב-Referer לשום משאב שהעמוד טוען.
function resetLink(token, lang) {
  const base = (process.env.PUBLIC_BASE_URL || "https://magenscan.com").replace(/\/$/, "");
  const prefix = lang === "en" ? "/en" : "";
  return `${base}${prefix}/reset-password#token=${token}`;
}

async function createResetToken(userId) {
  await db.ensureReady();
  // ביטול כל אסימון פתוח קודם של המשתמש.
  await db
    .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL")
    .run(userId);

  const token = crypto.randomBytes(32).toString("base64url");
  await db
    .prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, datetime('now', ?))`
    )
    .run(uuidv4(), userId, hashToken(token), `+${TOKEN_TTL_MINUTES} minutes`);
  return token;
}

// מחזיר את user_id אם האסימון תקף *ונצרך עכשיו*, אחרת null. הצריכה והבדיקה הן פעולה אחת.
async function consumeResetToken(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  await db.ensureReady();
  const row = await db
    .prepare(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
    )
    .get(hashToken(token));
  if (!row) return null;

  const claimed = await db
    .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL")
    .run(row.id);
  if (claimed.changes !== 1) return null; // בקשה מקבילה הקדימה אותנו
  return row.user_id;
}

// בדיקה בלי צריכה - לעמוד האיפוס, כדי לומר "הקישור פג" לפני שהמשתמש מקליד סיסמה.
async function isTokenValid(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return false;
  await db.ensureReady();
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM password_resets
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
    )
    .get(hashToken(token));
  return Boolean(row);
}

module.exports = { createResetToken, consumeResetToken, isTokenValid, resetLink, hashToken, TOKEN_TTL_MINUTES };
