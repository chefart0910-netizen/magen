import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

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
    <div className="auth-shell">
      <div className="auth-card card">
        <h1>התחברות</h1>
        <div className="sub">שמחים לראות אותך שוב.</div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-field">
            <label className="label">אימייל</label>
            <input
              className="input"
              type="email"
              required
              autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label className="label">סיסמה</label>
            <input
              className="input"
              type="password"
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
    </div>
  );
}
