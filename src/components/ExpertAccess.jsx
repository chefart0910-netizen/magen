import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

// MAGEN - מי מהמומחים רשאי להיכנס לדוחות של האתר הזה.
// ==========================================================================================
// הפאנל הזה שייך לבעל האתר בלבד. הוא מעניק לפי מייל, והוא מבטל. מומחה לא מופיע כאן עד
// שהוזמן, וביטול הוא מיידי - מהרגע שבוטל, המומחה לא קורא את הדוחות ולא כותב עליהם.

export default function ExpertAccess({ siteId }) {
  const [grants, setGrants] = useState([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const data = await api.listGrants(siteId);
      setGrants(data.grants || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const grant = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("נא להזין כתובת מייל");
      return;
    }
    setBusy(true);
    try {
      const data = await api.grantExpert(siteId, email.trim());
      setGrants(data.grants || []);
      setEmail("");
      setNotice("ההרשאה ניתנה. המומחה יראה את האתר הזה ברשימת הלקוחות שלו.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await api.revokeGrant(grantId);
      setGrants(data.grants || []);
      setNotice("ההרשאה בוטלה.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const active = grants.filter((g) => g.status === "active");

  return (
    <div className="card vo">
      <h2 className="vo-title">הרשאות מומחים</h2>
      <p className="text-dim vo-p">
        מומחה רואה את הדוחות של האתר הזה וכותב עליהם חוות דעת רק אחרי שהענקתם לו הרשאה כאן.
        אפשר לבטל בכל רגע, והביטול מיידי.
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="success-banner">{notice}</div>}

      <form onSubmit={grant} className="form-field">
        <label className="label" htmlFor={`grant-email-${siteId}`}>
          מייל המומחה
        </label>
        <div className="lp-scan-row">
          <input
            id={`grant-email-${siteId}`}
            className="input"
            type="email"
            dir="ltr"
            placeholder="expert@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit" disabled={busy}>
            הענק הרשאה
          </button>
        </div>
      </form>

      {active.length === 0 ? (
        <div className="text-dim">אף מומחה אינו מורשה לאתר הזה.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>מומחה</th>
              <th>מייל</th>
              <th>מאז</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.expert_name || "—"}
                  {g.expert_title ? <div className="text-dim">{g.expert_title}</div> : null}
                </td>
                <td dir="ltr">{g.expert_email}</td>
                <td>{formatDate(g.created_at)}</td>
                <td>
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busy}
                    onClick={() => revoke(g.id)}
                  >
                    בטל
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
