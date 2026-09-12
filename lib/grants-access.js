// MAGEN - בדיקת הרשאת מומחה לאתר.
// מודול נפרד ולא פונקציה שתלויה על ה-router של routes/grants.js, כדי ש-routes/reviews.js
// יוכל לבדוק הרשאה בלי לייבא route module שלם.
const db = require("./db");

async function hasActiveGrant(siteId, userId) {
  if (!siteId || !userId) return false;
  const row = await db
    .prepare("SELECT id FROM site_grants WHERE site_id = ? AND expert_user_id = ? AND status = 'active'")
    .get(siteId, userId);
  return !!row;
}

// טבלת ההכרעה עצמה, בלי מסד נתונים - כדי שתהיה ניתנת לבדיקה ישירה ושלא תהיה פזורה
// בתוך route handlers. הכלל: סימון מומחה לבד אינו גישה. הרשאה מבעל האתר היא התנאי.
function decideAccess({ isOwner = false, isAdmin = false, canReview = false, hasGrant = false } = {}) {
  const granted = !isOwner && canReview && hasGrant;
  return {
    granted,
    canRead: isOwner || isAdmin || granted,
    canWrite: isAdmin || granted,
  };
}

module.exports = { hasActiveGrant, decideAccess };
