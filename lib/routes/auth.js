const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { signToken } = require("../middleware/auth");
const { ah } = require("../async-handler");
const { normalizeUrl } = require("../normalize-url");
const { sendMail, isConfigured: mailConfigured } = require("../mailer");
const {
  createResetToken,
  consumeResetToken,
  isTokenValid,
  resetLink,
  TOKEN_TTL_MINUTES,
} = require("../services/password-reset");

const router = express.Router();

// --- הגבלת קצב על נתיבי האימות -----------------------------------------------------------
// אין כאן שום ויסות עד כה: אפשר היה לנחש סיסמאות ללא הגבלה, וכל ניסיון גם מפעיל
// bcrypt בעלות 12 - כלומר זה גם ניחוש סיסמאות וגם מתקפת עומס על הפונקציה עצמה.
//
// המגבלה: המנייה בזיכרון המופע, ו-Vercel מריץ כמה מופעים, כך שהתקרה בפועל גבוהה יותר.
// זה חסם ראשון שמייקר משמעותית ניחוש אוטומטי, לא הגנה מוחלטת - לזה צריך מנייה משותפת
// (טבלה ב-Turso), וזה הצעד הבא אם נראה ניסיונות אמיתיים ביומן.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_REGISTRATIONS = 5;
const attempts = new Map();

// כמו ב-routes/public.js: הערך השמאלי ב-X-Forwarded-For מגיע מהלקוח ולכן חסר ערך
// להגבלת קצב. x-real-ip נכתב על ידי הפלטפורמה.
function clientIp(req) {
  const real = String(req.headers["x-real-ip"] || "").trim();
  if (real) return real;
  const chain = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return chain.length ? chain[chain.length - 1] : req.socket?.remoteAddress || "unknown";
}

function tooManyAttempts(key, limit) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (recent.length >= limit) {
    attempts.set(key, recent);
    return true;
  }
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 5000) {
    for (const [k, times] of attempts) {
      if (!times.some((t) => now - t < LOGIN_WINDOW_MS)) attempts.delete(k);
    }
  }
  return false;
}


// צורה אחת ויחידה לכתובת מייל בכל המערכת. בלי זה אותו אדם יכול להחזיק שני חשבונות
// שנראים זהים, ובדיקות "האם זה אותו מייל" מפסיקות להסכים זו עם זו.
function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

// בדיקה שמרנית בכוונה: לא מנסה לאמת שהכתובת אמיתית (רק מייל אימות עושה את זה), רק
// לפסול קלט שאינו כתובת בכלל.
function isEmailShaped(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

// POST /api/auth/register
router.post(
  "/register",
  ah(async (req, res) => {
    const { password, full_name, account_type, professional_title, professional_site } =
      req.body || {};

    // כתובת המייל מנורמלת פעם אחת, כאן, ומכאן והלאה יש רק צורה אחת שלה. לפני התיקון
    // בדיקת הכפילות היתה רגישה לאותיות גדולות (כמו האינדקס הייחודי ב-SQLite) אבל
    // ההשוואה למייל האדמין לא היתה - ולכן הרשמה עם "Pavel@..." במקום "pavel@..."
    // עברה את בדיקת הכפילות *וגם* נחשבה לאדמין. זה היה השתלטות מלאה על המערכת
    // מנתיב הרשמה פתוח. הנרמול הוא התיקון; ההסרה של הענקת האדמין למטה היא החגורה השנייה.
    const email = normalizeEmail(req.body?.email);

    if (!email || !password) {
      return res.status(400).json({ error: "נדרשים אימייל וסיסמה" });
    }
    // הרשמה פותחת שורות במסד ושתי שורות יומן, מנתיב פתוח לחלוטין.
    if (tooManyAttempts(`reg:${clientIp(req)}`, MAX_REGISTRATIONS)) {
      return res.status(429).json({ error: "יותר מדי הרשמות מכתובת זו. נסו שוב בעוד רבע שעה." });
    }
    if (!isEmailShaped(email)) {
      return res.status(400).json({ error: "כתובת האימייל אינה תקינה" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "סיסמה חייבת להכיל לפחות 8 תווים" });
    }
    // bcrypt מתעלם מבתים אחרי ה-72 הראשונים. עדיף לומר את זה מראש מלחתוך בשקט.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "הסיסמה ארוכה מדי (עד 72 תווים)" });
    }

    await db.ensureReady();

    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "כבר קיים משתמש עם אימייל זה" });
    }

    // ההצהרה מתקבלת מהלקוח ולכן היא נתון לא אמין - היא נשמרת כבקשה בלבד. אין שום מסלול
    // שבו ערך שהגיע מהטופס מעניק הרשאה: is_expert לא נגזר מכאן ולעולם נשאר 0 בהרשמה.
    const accountType = account_type === "professional" ? "professional" : "owner";
    const proTitle =
      accountType === "professional" ? String(professional_title || "").trim().slice(0, 120) || null : null;

    // מאיש מקצוע נדרשת כתובת האתר שלו: זו הראיה היחידה שאפשר באמת לבדוק לפני אישור -
    // הכלי סורק אותה, והתוצאה מוצגת בבק-אופיס לצד הבקשה.
    let proSite = null;
    if (accountType === "professional") {
      proSite = normalizeUrl(professional_site);
      if (!proSite) {
        return res.status(400).json({ error: "נדרשת כתובת אתר תקינה לחשבון איש מקצוע" });
      }
    }

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    // הרשמה *לא* מעניקה אדמין, בשום מצב. הקידום של חשבון האדמין נעשה במקום אחד בלבד:
    // ה-UPDATE ב-db.js ensureReady(), שרץ מול הערך הקבוע בקוד ולא מול קלט מהבקשה.
    // כך גם אם הנרמול למעלה יישבר פעם, אין נתיב שבו מחרוזת מהטופס הופכת למישהו לאדמין.
    const plan = "free";

    await db
      .prepare(
        `INSERT INTO users
           (id, email, password_hash, full_name, plan, is_admin, account_type, professional_title, professional_site)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        email,
        password_hash,
        String(full_name || "").trim().slice(0, 120) || null,
        plan,
        0,
        accountType,
        proTitle,
        proSite
      );

    // האתר המוצהר נוסף מיד לרשימת האתרים שלו, כדי שיוכל לסרוק אותו בעצמו - וכדי
    // שהסריקה הזו תהיה הראיה שמוצגת בבק-אופיס.
    if (proSite) {
      await db
        .prepare("INSERT INTO sites (id, user_id, url, label) VALUES (?, ?, ?, ?)")
        .run(uuidv4(), id, proSite, "האתר שלי");
    }

    // ensureReady() כבר קידם את חשבון האדמין אם זה הוא; קוראים את המצב מה-DB במקום
    // להסיק אותו מהקלט.
    const saved = await db.prepare("SELECT plan, is_admin FROM users WHERE id = ?").get(id);
    const user = {
      id,
      email,
      plan: saved?.plan || plan,
      is_admin: !!saved?.is_admin,
      account_type: accountType,
    };
    const token = signToken(user);

    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(uuidv4(), id, "user_registered", `${email} type=${accountType}`);

    // בקשה לאישור כאיש מקצוע נרשמת בנפרד, כדי שתופיע ביומן הביקורת כפריט שממתין לטיפול
    // ולא תיבלע בתוך שורת ההרשמה.
    if (accountType === "professional") {
      await db
        .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
        .run(uuidv4(), id, "expert_requested", `${email} ${proSite} ${proTitle || ""}`.trim());
    }

    res.status(201).json({ token, user });
  })
);

// POST /api/auth/login
router.post(
  "/login",
  ah(async (req, res) => {
    const { password } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!email || !password) {
      return res.status(400).json({ error: "נדרשים אימייל וסיסמה" });
    }

    // שני מפתחות בכוונה: לפי כתובת (חוסם סקריפט שמנסה חשבונות רבים) ולפי חשבון (חוסם
    // תקיפה מרושתת על חשבון אחד). התשובה זהה בשני המקרים ולא מגלה אם החשבון קיים.
    if (
      tooManyAttempts(`ip:${clientIp(req)}`, MAX_LOGIN_ATTEMPTS) ||
      tooManyAttempts(`email:${email}`, MAX_LOGIN_ATTEMPTS)
    ) {
      return res.status(429).json({ error: "יותר מדי ניסיונות התחברות. נסו שוב בעוד רבע שעה." });
    }

    await db.ensureReady();

    // COLLATE NOCASE כדי שחשבונות ותיקים שנשמרו לפני הנרמול (באותיות גדולות) יוכלו
    // עדיין להתחבר, ולא ייעלמו בלי הסבר.
    const row = await db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
    if (!row) {
      return res.status(401).json({ error: "אימייל או סיסמה שגויים" });
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "אימייל או סיסמה שגויים" });
    }

    const user = {
      id: row.id,
      email: row.email,
      plan: row.plan,
      is_admin: !!row.is_admin,
      account_type: row.account_type || "owner",
    };
    const token = signToken({ ...user, token_version: row.token_version });

    res.json({ token, user });
  })
);

// --- שכחתי סיסמה ----------------------------------------------------------------------------
// שני כללים שמכתיבים את כל הצורה של הנתיב הזה:
//   1. אותה תשובה בדיוק, באותו זמן בערך, גם אם המייל לא רשום. אחרת הטופס הוא כלי לבדוק
//      מי לקוח של MAGEN - ולמי ששולח פישינג "בשם MAGEN" זו רשימת יעדים מאומתת.
//   2. הגבלת קצב גם לפי כתובת וגם לפי מייל, כדי שאי אפשר יהיה להפציץ תיבת דואר של מישהו
//      בעשרות מיילי איפוס דרכנו.
const MAX_FORGOT_PER_IP = 5;
const MAX_FORGOT_PER_EMAIL = 3;
const MAX_RESET_ATTEMPTS = 10;
// זמן תגובה מינימלי. הנתיב "משתמש קיים" כותב למסד ושולח מייל, ו"לא קיים" לא עושה כלום -
// בלי ריפוד, ההפרש בזמן התגובה מגלה בדיוק את מה שהתשובה האחידה מסתירה.
const FORGOT_MIN_MS = 1500;

const FORGOT_REPLY = {
  ok: true,
  message: "אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס הסיסמה. הקישור בתוקף לשעה.",
};

function resetMail(link, lang) {
  if (lang === "en") {
    return {
      subject: "Reset your MAGEN password",
      text:
        `Someone asked to reset the password for this MAGEN account.\n\n` +
        `To choose a new password, open this link (valid for ${TOKEN_TTL_MINUTES} minutes, one use only):\n${link}\n\n` +
        `If it wasn't you, ignore this email - your password stays as it is.`,
    };
  }
  return {
    subject: "איפוס סיסמה ל-MAGEN",
    text:
      `התקבלה בקשה לאיפוס הסיסמה של חשבון ה-MAGEN הזה.\n\n` +
      `כדי לבחור סיסמה חדשה, פתחו את הקישור (בתוקף ${TOKEN_TTL_MINUTES} דקות, לשימוש חד-פעמי):\n${link}\n\n` +
      `אם לא אתם ביקשתם - התעלמו מהמייל. הסיסמה נשארת כפי שהיא.`,
  };
}

// GET /api/auth/reset-available - האם שליחת קישור במייל פעילה. עד שיש דומיין ו-Resend
// התשובה היא false, והעמוד מפנה לפנייה ידנית במקום להבטיח מייל שלא יגיע.
router.get("/reset-available", (_req, res) => {
  res.json({ email: mailConfigured() });
});

// POST /api/auth/forgot-password  { email, lang }
router.post(
  "/forgot-password",
  ah(async (req, res) => {
    const started = Date.now();
    const email = normalizeEmail(req.body?.email);
    const lang = req.body?.lang === "en" ? "en" : "he";

    if (!email || !isEmailShaped(email)) {
      return res.status(400).json({ error: "כתובת האימייל אינה תקינה" });
    }
    if (tooManyAttempts(`forgot-ip:${clientIp(req)}`, MAX_FORGOT_PER_IP)) {
      return res.status(429).json({ error: "יותר מדי בקשות. נסו שוב בעוד רבע שעה." });
    }

    // חריגה במגבלת המייל *לא* מוחזרת כ-429: זה היה מגלה שהכתובת קיימת ושכבר נשלחו אליה
    // מיילים. פשוט לא שולחים עוד, ומחזירים את אותה תשובה.
    const emailThrottled = tooManyAttempts(`forgot-email:${email}`, MAX_FORGOT_PER_EMAIL);

    try {
      await db.ensureReady();
      const user = emailThrottled
        ? null
        : await db.prepare("SELECT id, email FROM users WHERE email = ? COLLATE NOCASE").get(email);

      if (user) {
        const token = await createResetToken(user.id);
        const { subject, text } = resetMail(resetLink(token, lang), lang);
        const result = await sendMail({ to: user.email, subject, text });
        await db
          .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
          .run(
            uuidv4(),
            user.id,
            "password_reset_requested",
            result.sent ? "mail sent" : `mail NOT sent (${result.reason})`
          );
      }
    } catch (err) {
      // תקלה פנימית לא משנה את התשובה - גם היא לא אמורה לגלות אם החשבון קיים.
      console.error("forgot-password:", err?.message || err);
    }

    const wait = FORGOT_MIN_MS + Math.floor(Math.random() * 300) - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    res.json(FORGOT_REPLY);
  })
);

// POST /api/auth/reset-password/check  { token } - האם הקישור עדיין תקף (בלי לצרוך אותו)
router.post(
  "/reset-password/check",
  ah(async (req, res) => {
    if (tooManyAttempts(`reset-ip:${clientIp(req)}`, MAX_RESET_ATTEMPTS * 3)) {
      return res.status(429).json({ error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה." });
    }
    res.json({ valid: await isTokenValid(req.body?.token) });
  })
);

// POST /api/auth/reset-password  { token, password }
router.post(
  "/reset-password",
  ah(async (req, res) => {
    const { token, password } = req.body || {};

    if (tooManyAttempts(`reset-ip:${clientIp(req)}`, MAX_RESET_ATTEMPTS)) {
      return res.status(429).json({ error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה." });
    }
    // אותן דרישות כמו בהרשמה - ונבדקות *לפני* צריכת האסימון, כדי שסיסמה קצרה מדי לא
    // "תשרוף" את הקישור ותכריח לבקש חדש.
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "סיסמה חייבת להכיל לפחות 8 תווים" });
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "הסיסמה ארוכה מדי (עד 72 תווים)" });
    }

    const userId = await consumeResetToken(token);
    if (!userId) {
      return res.status(400).json({ error: "הקישור אינו תקף - ייתכן שפג תוקפו או שכבר נעשה בו שימוש. בקשו קישור חדש." });
    }

    const password_hash = await bcrypt.hash(password, 12);
    // token_version + 1: כל JWT קיים של המשתמש נדחה מעכשיו (ראו middleware/auth.js).
    await db
      .prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?")
      .run(password_hash, userId);
    // וכל קישור איפוס אחר שאולי עוד פתוח - נסגר.
    await db
      .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL")
      .run(userId);
    await db
      .prepare("INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(uuidv4(), userId, "password_reset_completed", "all sessions revoked");

    // אין כניסה אוטומטית בכוונה: מי שמחזיק את הקישור הוכיח גישה לתיבת הדואר, לא יותר.
    // התחברות רגילה עם הסיסמה החדשה מאשרת שהמשתמש יודע מה הקליד - ועוברת דרך הגבלת
    // הקצב של ההתחברות כמו כל כניסה אחרת.
    res.json({ ok: true });
  })
);

module.exports = router;
