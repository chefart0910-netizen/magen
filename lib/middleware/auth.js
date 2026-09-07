const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "נדרשת התחברות" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

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
    { expiresIn: "7d" }
  );
}

module.exports = { requireAuth, requireAdmin, signToken, JWT_SECRET };
