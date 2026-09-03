import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const PLAN_LABELS = { free: "חינמי", basic: "בסיסי", pro: "פרו", enterprise: "אנטרפרייז" };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <nav className="navbar">
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

      <div className="page">{children}</div>
    </div>
  );
}
