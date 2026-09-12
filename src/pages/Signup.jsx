import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LangContext";
import Seo from "../components/Seo";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t, path } = useLang();
  const L = t.signup;
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    account_type: "owner",
    professional_title: "",
    professional_site: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form.email, form.password, form.full_name, {
        account_type: form.account_type,
        professional_title: form.professional_title,
        professional_site: form.professional_site,
      });
      navigate(path("/dashboard"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <Seo title={L.title} description={L.seoDesc} path="/signup" />
      <div className="auth-card card">
        <div className="auth-top">
          <LanguageSwitcher />
        </div>
        <h1>{L.title}</h1>
        <div className="sub">{L.sub}</div>

        {/* role=alert: בלעדיו קורא מסך לא מודיע למשתמש שההתחברות נכשלה. */}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="form-field">
            <label className="label" htmlFor="signup-name">{L.fullName}</label>
            <input className="input" id="signup-name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="label" htmlFor="signup-email">{L.email}</label>
            <input className="input" id="signup-email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {/* fieldset + legend ולא div + כותרת: כך קורא מסך מכריז על השאלה כולה לפני
              האפשרויות, ולא מקריא שתי תיבות בודדות בלי הקשר. */}
          <fieldset className="form-field account-type">
            <legend className="label">{L.howUse}</legend>

            <label className="choice">
              <input
                type="radio"
                name="account_type"
                value="owner"
                checked={form.account_type === "owner"}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
              />
              <span>
                <strong>{L.ownerTitle}</strong>
                <span className="choice-hint">{L.ownerHint}</span>
              </span>
            </label>

            <label className="choice">
              <input
                type="radio"
                name="account_type"
                value="professional"
                checked={form.account_type === "professional"}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
              />
              <span>
                <strong>{L.proTitle}</strong>
                <span className="choice-hint">{L.proHint}</span>
              </span>
            </label>
          </fieldset>

          {form.account_type === "professional" && (
            <>
              <div className="form-field">
                <label className="label" htmlFor="signup-site">{L.yourSite}</label>
                <input
                  className="input"
                  id="signup-site"
                  required
                  placeholder={t.landing.urlPlaceholder}
                  value={form.professional_site}
                  onChange={(e) => setForm({ ...form, professional_site: e.target.value })}
                />
                <div className="field-hint">{L.yourSiteHint}</div>
              </div>
              <div className="form-field">
                <label className="label" htmlFor="signup-title">{L.expertise}</label>
                <input
                  className="input"
                  id="signup-title"
                  maxLength={120}
                  placeholder={L.expertisePlaceholder}
                  value={form.professional_title}
                  onChange={(e) => setForm({ ...form, professional_title: e.target.value })}
                />
              </div>
              {/* אומרים מראש שזו בקשה ולא הרשאה מיידית, כדי שאיש מקצוע לא יחשוב שמשהו
                  שבור כשהוא לא מוצא את אפשרות כתיבת חוות הדעת אחרי ההרשמה. */}
              <div className="info-banner">{L.proNotice}</div>
            </>
          )}

          <div className="form-field">
            <label className="label" htmlFor="signup-password">{L.password}</label>
            <input className="input" id="signup-password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? L.submitting : L.submit}
          </button>
        </form>

        <div className="form-footer">
          {L.haveAccount} <Link to={path("/login")}>{L.loginLink}</Link>
        </div>
      </div>
    </main>
  );
}
