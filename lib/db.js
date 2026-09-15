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

// "העמודה כבר קיימת" הוא המצב הרגיל בכל קור-סטארט אחרי הראשון. כל שגיאה *אחרת* היא
// מיגרציה שנכשלה - ולבלוע אותה בשקט זה בדיוק מה שהפיל את עמוד התוצאה הציבורי עם
// "no such column: public_slug" אחרי שהמיגרציה "עברה". לכן מבליעים רק את הכפילות.
async function addColumn(table, column, definition) {
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    const message = String(err?.message || err).toLowerCase();
    const alreadyExists =
      message.includes("duplicate column") || message.includes("already exists");
    if (!alreadyExists) {
      throw new Error(`מיגרציה נכשלה: ${table}.${column} - ${err?.message || err}`);
    }
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

        -- הרשאת מומחה לאתר של לקוח. בלי הטבלה הזו כל מי שסומן is_expert היה יכול לקרוא
        -- ולכתוב חוות דעת על כל סריקה במערכת, של כל לקוח, בלי שהלקוח יודע או מאשר.
        -- ההרשאה היא תמיד של בעל האתר: הוא מעניק, הוא מבטל. status: 'active' | 'revoked'.
        CREATE TABLE IF NOT EXISTS site_grants (
          id TEXT PRIMARY KEY,
          site_id TEXT NOT NULL,
          expert_user_id TEXT NOT NULL,
          granted_by_user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          revoked_at TEXT,
          FOREIGN KEY (site_id) REFERENCES sites(id),
          FOREIGN KEY (expert_user_id) REFERENCES users(id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_site_grant_once
          ON site_grants (site_id, expert_user_id);

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          details TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      await addColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");

      // סימון "מומחה": מי שרשאי לכתוב חוות דעת מקצועית על סריקה (ראו routes/reviews.js).
      // ניתן ידנית מהבק-אופיס בלבד - אין הרשמה עצמית כמומחה.
      await addColumn("users", "is_expert", "INTEGER NOT NULL DEFAULT 0");

      // מה המשתמש הצהיר על עצמו בהרשמה: 'owner' (בעל אתר) או 'professional' (איש מקצוע).
      // חשוב להבחין בין זה לבין is_expert: זו *בקשה*, ולא הרשאה. ההרשאה לכתוב חוות דעת
      // ניתנת רק ידנית בבק-אופיס, אחרת כל אחד היה מכריז על עצמו מומחה וחוות הדעת בדוח
      // הלקוח היתה חסרת ערך.
      await addColumn("users", "account_type", "TEXT NOT NULL DEFAULT 'owner'");
      await addColumn("users", "professional_title", "TEXT");

      // האתר שאיש המקצוע מצהיר עליו כשלו. אין בו הרשאה - הוא הראיה שמוצגת בבק-אופיס:
      // אפשר לסרוק אותו בכלי עצמו ולראות מה מצבו לפני שמאשרים למישהו לחתום בשם על
      // דוחות של לקוחות.
      await addColumn("users", "professional_site", "TEXT");

      // כמה חוות דעת של המשתמש כבר אושרו. עד PROBATION_REVIEWS (ראו routes/reviews.js)
      // כל חוות דעת ממתינה לאישור לפני שהיא נראית ללקוח.
      await addColumn("users", "reviews_approved", "INTEGER NOT NULL DEFAULT 0");

      // אימות בעלות אמיתי (ראו routes/sites.js): האסימון שהמשתמש צריך לשים ב-DNS או באתר,
      // הדרך שבה האימות עבר בפועל, ומתי. בלי האסימון הדגל ownership_verified היה הצהרה
      // של המשתמש על עצמו - וזה מה שפותח בדיקת עומס מלאה ופנטסט אקטיבי.
      await addColumn("sites", "verification_token", "TEXT");
      await addColumn("sites", "verification_method", "TEXT");
      await addColumn("sites", "verified_at", "TEXT");

      // תזמון סריקות: 'weekly' | 'monthly' | NULL (כבוי). last_scheduled_scan_at הוא מה
      // שמונע הרצה כפולה - ה-cron רץ פעם ביום ובודק מי "הגיע לו".
      await addColumn("sites", "scan_schedule", "TEXT");
      await addColumn("sites", "last_scheduled_scan_at", "TEXT");

      // הכנה בלבד לעמוד תוצאה ציבורי לסריקה. אין כרגע שום נתיב, מסך או קישור שמשתמש
      // בעמודות האלה, וברירת המחדל היא לא-ציבורי. הן קיימות כדי שהפעלת הפיצ'ר בעתיד
      // תהיה הוספת route ועמוד, ולא מיגרציה על טבלה עם נתונים.
      // כלל שנקבע מראש: is_public נדלק רק בפעולה מפורשת של בעל האתר. שום סריקה לא
      // הופכת ציבורית מעצמה, וסריקה מעמוד הבית הציבורי לא נשמרת בכלל.
      await addColumn("scans", "is_public", "INTEGER NOT NULL DEFAULT 0");
      await addColumn("scans", "public_slug", "TEXT");

      // 'pending' = נכתבה אך טרם אושרה ואינה נראית ללקוח; 'published' = נראית בדוח.
      await addColumn("expert_reviews", "status", "TEXT NOT NULL DEFAULT 'published'");

      // אינדקס ייחודי חסר-רגישות לאותיות: זו החגורה במסד הנתונים נגד שני חשבונות
      // שנראים זהים ("a@b.com" ו-"A@B.com"). אם כבר קיימות כפילויות מלפני הנרמול,
      // היצירה תיכשל - ואז רושמים אזהרה וממשיכים, כי הנרמול ב-routes/auth.js כבר
      // מונע כפילויות חדשות ואין סיבה להשבית את כל המערכת בגלל זה.
      try {
        await client.execute(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_nocase ON users (lower(email))"
        );
      } catch (err) {
        console.error(
          "לא נוצר אינדקס ייחודי על lower(email) - כנראה קיימות כבר כפילויות:",
          err?.message || err
        );
      }

      // קידום חשבון האדמין - המקום *היחיד* שמעניק is_admin. COLLATE NOCASE כדי שגם
      // שורה ותיקה שנשמרה באותיות גדולות תיתפס.
      const { ADMIN_EMAIL } = require("./config");
      await client.execute({
        sql: "UPDATE users SET is_admin = 1, plan = 'enterprise' WHERE email = ? COLLATE NOCASE",
        args: [ADMIN_EMAIL],
      });
      // ובאותה נשימה: מי שאינו האדמין לא יכול להישאר אדמין. אם אי פעם נכתבה שורה כזו
      // (וזה קרה - ראו ההערה ב-routes/auth.js), היא מתבטלת בקור-סטארט הבא.
      await client.execute({
        sql: "UPDATE users SET is_admin = 0 WHERE is_admin = 1 AND email <> ? COLLATE NOCASE",
        args: [ADMIN_EMAIL],
      });
    })().catch((err) => {
      // בלי זה, כשל חולף אחד ב-Turso "מרעיל" את המכולה לכל חייה: כל בקשה הבאה ממתינה
      // לאותו promise דחוי וחוזרת כשגיאה, עד שהמכולה מתחלפת מעצמה.
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

module.exports = { prepare, ensureReady };
