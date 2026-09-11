import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import Seo from "../components/Seo";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <Seo
        title="התחברות"
        description="התחברו לחשבון MAGEN כדי לסרוק את האתר שלכם ולצפות בדוחות ביצועים, נגישות, SEO ואבטחה."
        path="/login"
      />
      <div className="auth-card card">
        <h1>התחברות</h1>
        <div className="sub">שמחים לראות אותך שוב.</div>

        {/* role=alert: בלעדיו קורא מסך לא מודיע למשתמש שההתחברות נכשלה. */}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="form-field">
            <label className="label" htmlFor="login-email">אימייל</label>
            <input
              className="input"
              id="login-email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label className="label" htmlFor="login-password">סיסמה</label>
            <input
              className="input"
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "מתחבר..." : "התחבר"}
          </button>
        </form>

        <div className="form-footer">
          עדיין אין לך חשבון? <Link to="/signup">הרשם עכשיו</Link>
        </div>
      </div>
    </main>
  );
}
