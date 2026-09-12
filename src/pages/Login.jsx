import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LangContext";
import Seo from "../components/Seo";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t, path } = useLang();
  const L = t.login;
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(path("/dashboard"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <Seo title={L.title} description={L.seoDesc} path="/login" />
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
            <label className="label" htmlFor="login-email">{L.email}</label>
            <input
              className="input"
              id="login-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label className="label" htmlFor="login-password">{L.password}</label>
            <input
              className="input"
              id="login-password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? L.submitting : L.submit}
          </button>
        </form>

        <div className="form-footer">
          {L.noAccount} <Link to={path("/signup")}>{L.signupLink}</Link>
        </div>
      </div>
    </main>
  );
}
