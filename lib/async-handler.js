// MAGEN - עוטף route handlers אסינכרוניים: Express 4 לא תופס דחיית Promise באופן אוטומטי,
// אז שגיאה שנזרקת בתוך async handler הייתה נשארת "תלויה" (בקשה בלי תשובה) בלי העטיפה הזו.
function ah(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { ah };
