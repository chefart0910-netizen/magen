import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import Seo from "../components/Seo";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
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
        title="הרשמה"
        description="פתחו חשבון MAGEN וסרקו אתר אחד בחינם - ביצועים, נגישות לפי תקן ישראלי 5568, SEO ואבטחה. ללא כרטיס אשראי."
        path="/signup"
      />
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
          {/* fieldset + legend ולא div + כותרת: כך קורא מסך מכריז על השאלה כולה לפני
              האפשרויות, ולא מקריא שתי תיבות בודדות בלי הקשר. */}
          <fieldset className="form-field account-type">
            <legend className="label">איך תשתמשו ב-MAGEN?</legend>

            <label className="choice">
              <input
                type="radio"
                name="account_type"
                value="owner"
                checked={form.account_type === "owner"}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
              />
              <span>
                <strong>יש לי אתר</strong>
                <span className="choice-hint">בדיקה וניטור של האתר שלי</span>
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
                <strong>אני איש מקצוע</strong>
                <span className="choice-hint">בונה או מתחזק אתרים עבור לקוחות</span>
              </span>
            </label>
          </fieldset>

          {form.account_type === "professional" && (
            <>
              <div className="form-field">
                <label className="label" htmlFor="signup-site">כתובת האתר שלכם</label>
                <input
                  className="input"
                  id="signup-site"
                  required
                  placeholder="example.co.il"
                  value={form.professional_site}
                  onChange={(e) => setForm({ ...form, professional_site: e.target.value })}
                />
                <div className="field-hint">
                  האתר יתווסף לחשבון ותוכלו לסרוק אותו. תוצאת הסריקה היא חלק מבדיקת הבקשה.
                </div>
              </div>
              <div className="form-field">
                <label className="label" htmlFor="signup-title">תחום ההתמחות (לא חובה)</label>
                <input
                  className="input"
                  id="signup-title"
                  maxLength={120}
                  placeholder="למשל: בניית אתרי וורדפרס · נגישות דיגיטלית"
                  value={form.professional_title}
                  onChange={(e) => setForm({ ...form, professional_title: e.target.value })}
                />
              </div>
              {/* אומרים מראש שזו בקשה ולא הרשאה מיידית, כדי שאיש מקצוע לא יחשוב שמשהו
                  שבור כשהוא לא מוצא את אפשרות כתיבת חוות הדעת אחרי ההרשמה. */}
              <div className="info-banner">
                חשבון איש מקצוע נבדק ידנית לפני שמתאפשרת כתיבת חוות דעת על סריקות, וגם לאחר
                האישור חוות הדעת הראשונות נקראות לפני שהן מגיעות ללקוח. עד לאישור החשבון פעיל
                רגיל, וניתן להוסיף אתרים ולסרוק אותם.
              </div>
            </>
          )}

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
