const BASE = "/api";

function getToken() {
  return localStorage.getItem("magen_token");
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
    localStorage.removeItem("magen_token");
    localStorage.removeItem("magen_user");
    if (location.pathname !== "/login" && location.pathname !== "/signup") {
      location.href = "/login";
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `שגיאה (${res.status})`);
  }
  return data;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),

  listSites: () => request("/sites"),
  addSite: (payload) => request("/sites", { method: "POST", body: payload }),
  deleteSite: (id) => request(`/sites/${id}`, { method: "DELETE" }),
  verifyOwnership: (id) => request(`/sites/${id}/verify-ownership`, { method: "POST" }),

  runScan: (siteId) => request(`/sites/${siteId}/scans`, { method: "POST" }),
  listScans: (siteId) => request(`/sites/${siteId}/scans`),
  getScanDetail: (scanId) => request(`/sites/detail/${scanId}`),

  runSecurityScan: (siteId) => request(`/sites/${siteId}/scans/security`, { method: "POST" }),
  runLoadTest: (siteId, payload) => request(`/sites/${siteId}/scans/load`, { method: "POST", body: payload }),
  runPentest: (siteId) => request(`/sites/${siteId}/scans/pentest`, { method: "POST" }),

  adminStats: () => request("/admin/stats"),
  adminUsers: () => request("/admin/users"),
  adminUpdatePlan: (userId, plan) => request(`/admin/users/${userId}/plan`, { method: "PATCH", body: { plan } }),
  adminSites: () => request("/admin/sites"),
  adminScans: () => request("/admin/scans"),
  adminAuditLog: () => request("/admin/audit-log"),
};

export { getToken };
