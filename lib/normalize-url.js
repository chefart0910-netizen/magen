// נרמול כתובת אתר - משותף להוספת אתר ע"י המשתמש ולאתר שאיש מקצוע מצהיר עליו בהרשמה,
// כדי ששתי הדרכים יגיעו לאותה מחרוזת בדיוק ולא ייווצרו שתי רשומות לאותו אתר.
function normalizeUrl(raw) {
  if (!raw) return null;
  let url = String(raw).trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    return new URL(url).toString();
  } catch (err) {
    return null;
  }
}

module.exports = { normalizeUrl };
