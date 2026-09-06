import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form.email, form.password, form.full_name);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card card">
        <h1>יצירת חשבון</h1>
        <div className="sub">התחל לסרוק אתרים תוך פחות מדקה — אתר אחד בחינם, ללא כרטיס אשראי.</div>

        {/* role=alert: בלעדיו קורא מסך לא מודיע למשתמש שההתחברות נכשלה. */}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="form-field">
            <label className="label" htmlFor="signup-name">שם מלא</label>
            <input className="input" id="signup-name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="label" htmlFor="signup-email">אימייל</label>
            <input className="input" id="signup-email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="label" htmlFor="signup-password">סיסמה (8 תווים לפחות)</label>
            <input className="input" id="signup-password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "יוצר חשבון..." : "צור חשבון"}
          </button>
        </form>

        <div className="form-footer">
          כבר יש לך חשבון? <Link to="/login">התחבר</Link>
        </div>
      </div>
    </main>
  );
}
