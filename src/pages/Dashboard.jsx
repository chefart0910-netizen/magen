import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { formatDate } from "../lib/format";

export default function Dashboard() {
  const { user } = useAuth();
  const [sites, setSites] = useState(null);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ url: "", label: "" });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [pendingExpert, setPendingExpert] = useState(false);

  const load = async () => {
    try {
      const data = await api.listSites();
      setSites(data.sites);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    // סטטוס אישור איש מקצוע נשאל מהשרת ולא נלקח מהמשתמש השמור בדפדפן, כדי שהאישור
    // ייכנס לתוקף ברענון עמוד ולא רק אחרי התחברות מחדש.
    api
      .reviewerStatus()
      .then((d) => setPendingExpert(!!d.pending_expert))
      .catch(() => {});
  }, []);

  const addSite = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.addSite({ url: form.url, label: form.label || undefined });
      setForm({ url: "", label: "" });
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeSite = async (id) => {
    if (!confirm("להסיר את האתר ואת כל היסטוריית הבדיקות שלו?")) return;
    setBusyId(id);
    try {
      await api.deleteSite(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const verify = async (id) => {
    setBusyId(id);
    try {
      await api.verifyOwnership(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>האתרים שלי</h1>
          <div className="sub">
            {user?.plan === "free"
              ? "בחבילה החינמית תקבל דוח חלקי אמיתי (לא מזויף) לכל אתר. שדרג לדוח מלא."
              : "מעקב אחרי ביצועים, נגישות, אבטחה ועומס לכל האתרים שלך."}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          + הוספת אתר
        </button>
      </div>

      {pendingExpert && (
        <div className="info-banner">
          בקשתכם לחשבון איש מקצוע ממתינה לאישור. עד לאישור אפשר להוסיף אתרים ולסרוק אותם כרגיל;
          כתיבת חוות דעת על סריקות תיפתח לאחר הבדיקה.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {sites === null && <div className="text-dim">טוען...</div>}

      {sites && sites.length === 0 && (
        <div className="card empty-state">
          <div style={{ fontSize: 15, marginBottom: 8 }}>עדיין לא הוספת אתרים</div>
          <div className="sub" style={{ marginBottom: 16 }}>
            הוסף כתובת אתר כדי להתחיל לקבל דוחות ביצועים ונגישות אמיתיים.
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            הוספת האתר הראשון
          </button>
        </div>
      )}

      {sites && sites.length > 0 && (
        <div className="grid grid-2">
          {sites.map((site) => (
            <div className="card site-card" key={site.id}>
              <div className="site-url">{site.url}</div>
              {site.label && <div className="site-label">{site.label}</div>}

              <div className="site-meta">
                <span className={`chip ${site.ownership_verified ? "verified" : "unverified"}`}>
                  {site.ownership_verified ? "בעלות מאומתת" : "בעלות לא מאומתת"}
                </span>
                <span>{site.scans_count} בדיקות</span>
                <span>נוסף {formatDate(site.created_at)}</span>
              </div>

              <div className="site-actions">
                <Link className="btn btn-primary btn-sm" to={`/sites/${site.id}`}>
                  פתח / הרץ בדיקה
                </Link>
                {!site.ownership_verified && (
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === site.id}
                    onClick={() => verify(site.id)}
                  >
                    אמת בעלות
                  </button>
                )}
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busyId === site.id}
                  onClick={() => removeSite(site.id)}
                >
                  הסר
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>הוספת אתר</h1>
            <form onSubmit={addSite}>
              <div className="form-field">
                <label className="label">כתובת אתר</label>
                <input
                  className="input"
                  required
                  autoFocus
                  placeholder="example.com"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label className="label">תווית (אופציונלי)</label>
                <input
                  className="input"
                  placeholder="לדוגמה: אתר החברה"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? "מוסיף..." : "הוסף אתר"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAdd(false)}
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
