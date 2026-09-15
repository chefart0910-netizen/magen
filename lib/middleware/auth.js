const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const db = require("../db");

// לפני התיקון היה כאן fallback לקבוע "dev-secret-change-in-production". משמעותו: בכל
// סביבה שבה JWT_SECRET לא מוגדר, מפתח החתימה הוא מחרוזת מפורסמת - וכל אחד יכול לחתום
// טוקן בשם כל משתמש, כולל האדמין. זו הסיבה שאין כאן ברירת מחדל קבועה.
//
// גם לא נבחרה כאן זריקת שגיאה שמפילה את כל השירות: אתר חי לא צריך לרדת בגלל משתנה
// סביבה חסר. במקום זה נוצר סוד אקראי לכל מכולה - אף אחד לא יכול לנחש אותו, וההתנתקויות
// התכופות (סוד חדש בכל קור-סטארט) הן הסימפטום הרועש שאומר שצריך להגדיר את המשתנה.
const RAW_SECRET = process.env.JWT_SECRET || "";
const SECRET_OK = RAW_SECRET.length >= 32;
if (!SECRET_OK) {
  console.error(
    RAW_SECRET
      ? "JWT_SECRET קצר מ-32 תווים - לא בשימוש. נוצר סוד אקראי זמני; הגדירו JWT_SECRET ב-Environment Variables."
      : "JWT_SECRET אינו מוגדר - נוצר סוד אקראי זמני. משתמשים יתנתקו בכל קור-סטארט עד שיוגדר ב-Environment Variables."
  );
}
const JWT_SECRET = SECRET_OK ? RAW_SECRET : crypto.randomBytes(48).toString("hex");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "נדרשת התחברות" });
  }

  try {
    // קיבוע האלגוריתם: בלעדיו מקבלים כל alg שהטוקן מצהיר עליו.
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });

    // הגנה חשובה: טוקן יכול להיות תקין קריפטוגרפית אך להצביע על משתמש שכבר לא קיים
    // (למשל אחרי איפוס מסד הנתונים בפיתוח) - עדיף הודעה ברורה מאשר שגיאת DB מבלבלת בהמשך.
    // בנוסף: תמיד שולפים plan/is_admin חיים מה-DB (לא סומכים על הטוקן), כדי ששדרוג חבילה
    // או קידום לאדמין ייכנסו לתוקף מיד, גם אם הטוקן נחתם לפני השינוי.
    await db.ensureReady();
    const freshUser = await db.prepare("SELECT id, email, plan, is_admin, is_expert FROM users WHERE id = ?").get(payload.id);
    if (!freshUser) {
      return res.status(401).json({ error: "החשבון לא נמצא - נא להתחבר מחדש" });
    }

    req.user = {
      id: freshUser.id,
      email: freshUser.email,
      plan: freshUser.plan,
      is_admin: !!freshUser.is_admin,
      is_expert: !!freshUser.is_expert,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "טוקן לא תקין או שפג תוקפו" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: "נדרשת הרשאת אדמין" });
  }
  next();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: "7d", algorithm: "HS256" }
  );
}

// JWT_SECRET לא מיוצא בכוונה - אין לו קורא, ואין סיבה שסוד יסתובב בין מודולים.
module.exports = { requireAuth, requireAdmin, signToken };
