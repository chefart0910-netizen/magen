import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import AccessibilityWidget from "./AccessibilityWidget";

const PLAN_LABELS = { free: "חינמי", basic: "בסיסי", pro: "פרו", enterprise: "אנטרפרייז" };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      {/* חייב להיות הרכיב הממוקד הראשון בעמוד - אחרת משתמש מקלדת עובר את כל הניווט מחדש
          בכל מעבר עמוד. מוסתר ויזואלית עד שהוא מקבל מיקוד. */}
      <a className="skip-link" href="#main-content">
        דילוג לתוכן המרכזי
      </a>

      <div className="app-shell">
      <nav className="navbar" aria-label="ניווט ראשי">
        <div className="brand">
          MAGEN <span className="badge">בטא</span>
        </div>

        {user && (
          <div className="nav-links">
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              האתרים שלי
            </NavLink>
            {user.is_admin && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>
                בק-אופיס
              </NavLink>
            )}
          </div>
        )}

        {user && (
          <div className="user-area">
            <span className={`plan-pill ${user.plan}`}>{PLAN_LABELS[user.plan] || user.plan}</span>
            <span>{user.email}</span>
            <button className="btn btn-secondary btn-sm" onClick={doLogout}>
              התנתק
            </button>
          </div>
        )}
      </nav>

      <main id="main-content" className="page" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <span>MAGEN</span>
        <Link to="/accessibility">הצהרת נגישות</Link>
      </footer>
      </div>

      <AccessibilityWidget />
    </>
  );
}
