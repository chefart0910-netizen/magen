import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useLang } from "../lib/LangContext";
import Seo from "../components/Seo";
import LanguageSwitcher from "../components/LanguageSwitcher";

// MAGEN - "שכחתי סיסמה".
// התשובה אחרי שליחה זהה תמיד, בין אם הכתובת רשומה ובין אם לא - השרת מחזיר אותו דבר,
// והעמוד לא מנסה לנחש. כל ניסוח כמו "לא מצאנו את הכתובת" היה הופך את הטופס לכלי שבודק
// מי לקוח של MAGEN.
//
// כל עוד שליחת מייל לא מוגדרת בשרת, העמוד לא מציג טופס שמבטיח מייל שלא יגיע - הוא מפנה
// לפנייה ידנית מהכתובת הרשומה, והאדמין מפיק קישור מהבק-אופיס.
const SUPPORT_EMAIL = "pavelchervonchik@gmail.com";

export default function ForgotPassword() {
  const { t, lang, path } = useLang();
  const L = t.forgot;
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [mailOn, setMailOn] = useState(null); // null = עדיין לא ידוע

  useEffect(() => {
    api
      .resetAvailable()
      .then((d) => setMailOn(!!d.email))
      .catch(() => setMailOn(true)); // ספק - מציגים את הטופס; התשובה ממילא אחידה
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.forgotPassword(email, lang);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <Seo title={L.title} description={L.sub} path="/forgot-password" noindex />
      <div className="auth-card card">
        <div className="auth-top">
          <LanguageSwitcher />
        </div>
        <h1>{L.title}</h1>

        {mailOn === null ? (
          <div className="text-dim">…</div>
        ) : mailOn === false ? (
          <div className="info-banner" role="status">
            {L.manual}{" "}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(L.manualSubject)}`} dir="ltr">
              {SUPPORT_EMAIL}
            </a>
          </div>
        ) : done ? (
          <div className="success-banner" role="status">
            {L.sent}
          </div>
        ) : (
          <>
            <div className="sub">{L.sub}</div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={submit}>
              <div className="form-field">
                <label className="label" htmlFor="forgot-email">{L.email}</label>
                <input
                  className="input"
                  id="forgot-email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-block" disabled={loading}>
                {loading ? L.submitting : L.submit}
              </button>
            </form>
          </>
        )}

        <div className="form-footer">
          <Link to={path("/login")}>{L.backToLogin}</Link>
        </div>
      </div>
    </main>
  );
}
