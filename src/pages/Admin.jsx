import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDate, scoreClass, STATUS_LABELS } from "../lib/format";

const PLANS = ["free", "basic", "pro", "enterprise"];
const PLAN_LABELS = { free: "חינמי", basic: "בסיסי", pro: "פרו", enterprise: "אנטרפרייז" };

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return <div className="text-dim">טוען...</div>;

  return (
    <div>
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-value">{stats.usersCount}</div>
          <div className="stat-label">משתמשים</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{stats.sitesCount}</div>
          <div className="stat-label">אתרים במעקב</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{stats.scansCount}</div>
          <div className="stat-label">בדיקות שבוצעו</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>בדיקות לפי סטטוס</h3>
          {stats.scansByStatus.length === 0 && <div className="text-dim">אין נתונים עדיין</div>}
          {stats.scansByStatus.map((row) => (
            <div key={row.status} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span className={`status-badge ${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>
              <span>{row.c}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>משתמשים לפי חבילה</h3>
          {stats.usersByPlan.map((row) => (
            <div key={row.plan} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span className="plan-pill">{PLAN_LABELS[row.plan] || row.plan}</span>
              <span>{row.c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => api.adminUsers().then((d) => setUsers(d.users)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  // סימון "מומחה" הוא אישור אנושי לכך שדבריו של המשתמש ייכנסו לדוח שהלקוח מקבל,
  // ולכן הוא ניתן כאן בלבד ולא בהרשמה.
  const toggleExpert = async (id, next) => {
    setBusyId(id);
    setError("");
    try {
      await api.adminSetExpert(id, next);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const changePlan = async (id, plan) => {
    setBusyId(id);
    setError("");
    try {
      await api.adminUpdatePlan(id, plan);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <div className="error-banner">{error}</div>;
  if (!users) return <div className="text-dim">טוען...</div>;

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>אימייל</th>
            <th>שם</th>
            <th>אתרים</th>
            <th>אדמין</th>
            <th>מומחה</th>
            <th>חבילה</th>
            <th>נרשם</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.full_name || "-"}</td>
              <td>{u.sites_count}</td>
              <td>{u.is_admin ? "כן" : "-"}</td>
              <td>
                <label className="expert-toggle">
                  <input
                    type="checkbox"
                    checked={!!u.is_expert}
                    disabled={busyId === u.id}
                    onChange={(e) => toggleExpert(u.id, e.target.checked)}
                  />
                  <span className="sr-only">סימון {u.email} כמומחה</span>
                </label>
              </td>
              <td>
                <select
                  className="input"
                  style={{ padding: "4px 8px", fontSize: 13 }}
                  value={u.plan}
                  disabled={busyId === u.id}
                  onChange={(e) => changePlan(u.id, e.target.value)}
                >
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {PLAN_LABELS[p]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="text-dim">{formatDate(u.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SitesTab() {
  const [sites, setSites] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminSites().then((d) => setSites(d.sites)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!sites) return <div className="text-dim">טוען...</div>;

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>כתובת</th>
            <th>בעלים</th>
            <th>בעלות מאומתת</th>
            <th>נוסף</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id}>
              <td>{s.url}</td>
              <td>{s.owner_email}</td>
              <td>
                <span className={`chip ${s.ownership_verified ? "verified" : "unverified"}`}>
                  {s.ownership_verified ? "כן" : "לא"}
                </span>
              </td>
              <td className="text-dim">{formatDate(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScansTab() {
  const [scans, setScans] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminScans().then((d) => setScans(d.scans)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!scans) return <div className="text-dim">טוען...</div>;

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>אתר</th>
            <th>בעלים</th>
            <th>סוג</th>
            <th>סטטוס</th>
            <th>ביצועים</th>
            <th>נגישות</th>
            <th>תאריך</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((s) => (
            <tr key={s.id}>
              <td>{s.site_url}</td>
              <td>{s.owner_email}</td>
              <td>{s.scan_type}</td>
              <td>
                <span className={`status-badge ${s.status}`}>{STATUS_LABELS[s.status] || s.status}</span>
              </td>
              <td className={scoreClass(s.score_performance)}>{s.score_performance ?? "-"}</td>
              <td className={scoreClass(s.score_accessibility)}>{s.score_accessibility ?? "-"}</td>
              <td className="text-dim">{formatDate(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogTab() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminAuditLog().then((d) => setLogs(d.logs)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!logs) return <div className="text-dim">טוען...</div>;

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>פעולה</th>
            <th>פרטים</th>
            <th>תאריך</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>{l.action}</td>
              <td className="text-dim">{l.details}</td>
              <td className="text-dim">{formatDate(l.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { key: "stats", label: "סטטיסטיקות", Component: StatsTab },
  { key: "users", label: "משתמשים", Component: UsersTab },
  { key: "sites", label: "אתרים", Component: SitesTab },
  { key: "scans", label: "בדיקות", Component: ScansTab },
  { key: "audit", label: "לוג ביקורת", Component: AuditLogTab },
];

export default function Admin() {
  const [tab, setTab] = useState("stats");
  const Active = TABS.find((t) => t.key === tab).Component;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>בק-אופיס</h1>
          <div className="sub">ניהול תפעולי של המערכת - משתמשים, אתרים, בדיקות ולוג ביקורת.</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      <Active />
    </>
  );
}
