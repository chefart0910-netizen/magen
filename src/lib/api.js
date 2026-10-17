const BASE = "/api";

function getToken() {
  // localStorage זורק כשנתוני אתר חסומים (חלון פרטי בספארי, הגדרות נוקשות) - ואם זה
  // קורה כאן, כל קריאה ל-API נופלת לפני שהיא נשלחת.
  try {
    return localStorage.getItem("magen_token");
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && auth) {
    // טוקן לא תקין/שפג/מצביע על משתמש שלא קיים - ניקוי אוטומטי והפניה להתחברות
    // מונע מצב שבו המשתמש תקוע עם שגיאה מבלבלת בלי לדעת שצריך פשוט להתחבר מחדש.
    try {
      localStorage.removeItem("magen_token");
      localStorage.removeItem("magen_user");
    } catch {
      // אחסון חסום - ההפניה למטה עדיין נכונה.
    }
    // שמירת קידומת השפה. קודם הופנה תמיד ל-"/login" העברי, כך שכל פקיעת סשן של משתמש
    // אנגלי החזירה אותו לעברית - וגם הבדיקה למטה לא הכירה "/en/login", ולכן משתמש
    // שכבר עמד על מסך ההתחברות האנגלי נזרק ברענון מלא למסך העברי.
    const prefix = location.pathname === "/en" || location.pathname.startsWith("/en/") ? "/en" : "";
    const authPaths = [`${prefix}/login`, `${prefix}/signup`];
    if (!authPaths.includes(location.pathname)) {
      location.href = `${prefix}/login`;
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `שגיאה (${res.status})`);
  }
  return data;
}

export const api = {
  // סריקת הטעימה בעמוד הבית - ללא טוקן בכוונה (auth: false), זה הנתיב הציבורי היחיד.
  publicScan: (url) => request("/public/scan", { method: "POST", body: { url }, auth: false }),
  // תוצאה ציבורית שפורסמה (/s/:slug) - ללא טוקן, זה עמוד פתוח.
  publicScanResult: (slug) => request(`/public/scan/${slug}`, { auth: false }),
  shareScan: (siteId, scanId, publish) =>
    request(`/sites/${siteId}/scans/${scanId}/share`, { method: "POST", body: { publish } }),

  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  // שכחתי סיסמה. האסימון מגיע מה-hash של הכתובת ונשלח בגוף הבקשה בלבד.
  resetAvailable: () => request("/auth/reset-available", { auth: false }),
  forgotPassword: (email, lang) =>
    request("/auth/forgot-password", { method: "POST", body: { email, lang }, auth: false }),
  checkResetToken: (token) =>
    request("/auth/reset-password/check", { method: "POST", body: { token }, auth: false }),
  resetPassword: (token, password) =>
    request("/auth/reset-password", { method: "POST", body: { token, password }, auth: false }),

  listSites: () => request("/sites"),
  addSite: (payload) => request("/sites", { method: "POST", body: payload }),
  deleteSite: (id) => request(`/sites/${id}`, { method: "DELETE" }),
  // אימות בעלות: getVerification מחזיר את האסימון וההוראות, verifyOwnership מבקש
  // מהשרת לבדוק בפועל (DNS TXT / קובץ / תג meta) - ראו lib/routes/sites.js.
  getVerification: (id) => request(`/sites/${id}/verification`),
  verifyOwnership: (id) => request(`/sites/${id}/verify-ownership`, { method: "POST" }),

  // תזמון סריקה אוטומטית. "off" מכבה (ראו lib/routes/sites.js).
  setSchedule: (siteId, schedule) =>
    request(`/sites/${siteId}/schedule`, { method: "PATCH", body: { schedule } }),

  runScan: (siteId) => request(`/sites/${siteId}/scans`, { method: "POST" }),
  listScans: (siteId) => request(`/sites/${siteId}/scans`),
  getScanDetail: (scanId) => request(`/sites/detail/${scanId}`),

  runSecurityScan: (siteId) => request(`/sites/${siteId}/scans/security`, { method: "POST" }),
  runLoadTest: (siteId, payload) => request(`/sites/${siteId}/scans/load`, { method: "POST", body: payload }),
  runPentest: (siteId) => request(`/sites/${siteId}/scans/pentest`, { method: "POST" }),

  // חוות דעת מקצועית על סריקה (routes/reviews.js)
  reviewerStatus: () => request("/reviews/me"),
  getScanReviews: (scanId) => request(`/reviews/scan/${scanId}`),
  saveScanReview: (scanId, payload) => request(`/reviews/scan/${scanId}`, { method: "POST", body: payload }),
  deleteReview: (reviewId) => request(`/reviews/${reviewId}`, { method: "DELETE" }),

  // הרשאות מומחה לאתר (lib/routes/grants.js). ההענקה והביטול תמיד של בעל האתר.
  listGrants: (siteId) => request(`/grants/site/${siteId}`),
  grantExpert: (siteId, email) => request(`/grants/site/${siteId}`, { method: "POST", body: { email } }),
  revokeGrant: (grantId) => request(`/grants/${grantId}`, { method: "DELETE" }),
  myGrantedSites: () => request("/grants/mine"),

  adminStats: () => request("/admin/stats"),
  adminUsers: () => request("/admin/users"),
  adminUpdatePlan: (userId, plan) => request(`/admin/users/${userId}/plan`, { method: "PATCH", body: { plan } }),
  adminPendingReviews: () => request("/admin/pending-reviews"),
  adminReviewAction: (reviewId, action) =>
    request(`/admin/reviews/${reviewId}`, { method: "PATCH", body: { action } }),
  adminSetExpert: (userId, is_expert) =>
    request(`/admin/users/${userId}/expert`, { method: "PATCH", body: { is_expert } }),
  adminResetLink: (userId) => request(`/admin/users/${userId}/reset-link`, { method: "POST" }),
  adminSites: () => request("/admin/sites"),
  adminScans: () => request("/admin/scans"),
  adminAuditLog: () => request("/admin/audit-log"),

  // חיפוש אישי - אתרים וממצאי סריקה של המשתמש המחובר (lib/routes/search.js).
  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),

  // הגדרות התראות מעקב (webhook + הפעלה/כיבוי - lib/routes/account.js).
  getAlertSettings: () => request("/account/alerts"),
  saveAlertSettings: (payload) => request("/account/alerts", { method: "PATCH", body: payload }),
};

export { getToken };
