import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LangContext";
import Seo from "../components/Seo";
import LanguageSwitcher from "../components/LanguageSwitcher";

// MAGEN - בחירת סיסמה חדשה מקישור האיפוס.
// ==========================================================================================
// האסימון מגיע ב-hash (#token=...) ולא ב-query: החלק הזה לא נשלח לשרת, לא נרשם ביומנים
// ולא דולף ב-Referer. מיד אחרי הקריאה מוחקים אותו מהכתובת, כדי שלא יישאר בהיסטוריית
// הדפדפן ולא יועתק בטעות עם הכתובת.

function readTokenFromHash() {
  const m = /(?:^#|&)token=([^&]+)/.exec(window.location.hash || "");
  return m ? decodeURIComponent(m[1]) : "";
}

export default function ResetPassword() {
  const { t, path } = useLang();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const L = t.reset;
  const [token] = useState(readTokenFromHash);
  const [status, setStatus] = useState(token ? "checking" : "invalid"); // checking | ready | invalid | done
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (!token) return;
    api
      .checkResetToken(token)
      .then((d) => setStatus(d.valid ? "ready" : "invalid"))
      .catch(() => setStatus("invalid"));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(L.mismatch);
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      // כל הסשנים בוטלו בשרת. אם הדפדפן הזה היה מחובר - הטוקן שלו כבר לא תקף.
      if (user) logout();
      setStatus("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <Seo title={L.title} path="/reset-password" noindex />
      <div className="auth-card card">
        <div className="auth-top">
          <LanguageSwitcher />
        </div>
        <h1>{L.title}</h1>

        {status === "checking" && <div className="text-dim">{L.checking}</div>}

        {status === "invalid" && (
          <>
            <div className="error-banner" role="alert">
              {L.invalid}
            </div>
            <div className="form-footer">
              <Link to={path("/forgot-password")}>{L.requestNew}</Link>
            </div>
          </>
        )}

        {status === "done" && (
          <>
            <div className="success-banner" role="status">
              {L.done}
            </div>
            <button className="btn btn-primary btn-block" onClick={() => navigate(path("/login"))}>
              {L.toLogin}
            </button>
          </>
        )}

        {status === "ready" && (
          <>
            <div className="sub">{L.sub}</div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={submit}>
              <div className="form-field">
                <label className="label" htmlFor="reset-password">{L.password}</label>
                <input
                  className="input"
                  id="reset-password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="label" htmlFor="reset-confirm">{L.confirm}</label>
                <input
                  className="input"
                  id="reset-confirm"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-block" disabled={loading}>
                {loading ? L.submitting : L.submit}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
