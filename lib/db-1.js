// MAGEN - שכבת מסד נתונים לפריסת Vercel: Turso (libSQL מנוהל בענן) במקום node:sqlite המקומי.
// ==========================================================================================
// למה השינוי: בפונקציית serverless אין דיסק קבוע - node:sqlite שכתב ל-/tmp התאפס בין "קרים"
// (cold starts) שונים, מה שגרם למשתמשים "להיזרק" להתחברות מחדש כמה שניות אחרי שנרשמו.
// Turso הוא שירות SQLite מנוהל חיצוני (תואם libSQL) - הנתונים נשמרים אמיתית מחוץ למכולה.
//
// הבדל API חשוב: node:sqlite הוא סינכרוני, @libsql/client הוא אסינכרוני (HTTP מתחת למכסה).
// לכן השכבה הזו חושפת ממשק דומה ל-node:sqlite (db.prepare(sql).get/all/run) אבל כל מתודה
// מחזירה Promise - כל הקוד שקורא לה (routes/middleware) עודכן בהתאם לעבוד עם await.

const { createClient } = require("@libsql/client");

// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN חייבים להיות מוגדרים כ-Environment Variables
// אמיתיים בהגדרות הפרויקט ב-Vercel (Project Settings -> Environment Variables) - לא
// מוטמעים כאן בקוד, כדי לא לחשוף credentials בקוד המקור.
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error(
    "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN לא מוגדרים - נדרשים כדי להתחבר למסד הנתונים החיצוני (Turso)."
  );
}

const client = createClient({ url, authToken });

function prepare(sql) {
  return {
    async run(...params) {
      const result = await client.execute({ sql, args: params });
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
    },
    async get(...params) {
      const result = await client.execute({ sql, args: params });
      return result.rows[0] || undefined;
    },
    async all(...params) {
      const result = await client.execute({ sql, args: params });
      return result.rows;
    },
  };
}

// מריץ כמה statements ברצף (execute יחיד לא תומך במספר statements מופרדים ב-";" ב-libSQL).
async function execMany(sql) {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await client.execute(statement);
  }
}

let readyPromise = null;

// אתחול הסכימה - אידמפוטנטי (CREATE TABLE IF NOT EXISTS), מותר לקרוא לו בכל קור-סטארט.
// נשמר כ-promise יחיד (לא רץ כמה פעמים במקביל באותה מכולה חמה).
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await execMany(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT,
          plan TEXT NOT NULL DEFAULT 'free',
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sites (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          url TEXT NOT NULL,
          label TEXT,
          ownership_verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS scans (
          id TEXT PRIMARY KEY,
          site_id TEXT NOT NULL,
          scan_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          result_json TEXT,
          score_performance INTEGER,
          score_accessibility INTEGER,
          score_security INTEGER,
          score_seo INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT,
          FOREIGN KEY (site_id) REFERENCES sites(id)
        );

        CREATE TABLE IF NOT EXISTS expert_reviews (
          id TEXT PRIMARY KEY,
          scan_id TEXT NOT NULL,
          site_id TEXT NOT NULL,
          expert_user_id TEXT NOT NULL,
          expert_name TEXT,
          expert_title TEXT,
          score_opinion TEXT,
          summary TEXT NOT NULL,
          improvements TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          FOREIGN KEY (scan_id) REFERENCES scans(id),
          FOREIGN KEY (site_id) REFERENCES sites(id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_expert_review_once
          ON expert_reviews (scan_id, expert_user_id);

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          details TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      try {
        await client.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
      } catch (err) {
        // העמודה כבר קיימת - בסדר גמור.
      }

      // סימון "מומחה": מי שרשאי לכתוב חוות דעת מקצועית על סריקה (ראו routes/reviews.js).
      // ניתן ידנית מהבק-אופיס בלבד - אין הרשמה עצמית כמומחה.
      try {
        await client.execute("ALTER TABLE users ADD COLUMN is_expert INTEGER NOT NULL DEFAULT 0");
      } catch (err) {
        // העמודה כבר קיימת - בסדר גמור.
      }

      const { ADMIN_EMAIL } = require("./config");
      await client.execute({
        sql: "UPDATE users SET is_admin = 1, plan = 'enterprise' WHERE email = ?",
        args: [ADMIN_EMAIL],
      });
    })();
  }
  return readyPromise;
}

module.exports = { prepare, ensureReady };
