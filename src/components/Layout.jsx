import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LangContext";
import AccessibilityWidget from "./AccessibilityWidget";
import LanguageSwitcher from "./LanguageSwitcher";

const PLAN_LABELS = {
  he: { free: "חינמי", basic: "בסיסי", pro: "פרו", enterprise: "אנטרפרייז" },
  en: { free: "Free", basic: "Basic", pro: "Pro", enterprise: "Enterprise" },
};

const T = {
  he: {
    skip: "דילוג לתוכן המרכזי",
    beta: "בטא",
    mainNav: "ניווט ראשי",
    mySites: "האתרים שלי",
    backOffice: "בק-אופיס",
    logout: "התנתק",
    accessibility: "הצהרת נגישות",
  },
  en: {
    skip: "Skip to main content",
    beta: "Beta",
    mainNav: "Main navigation",
    mySites: "My sites",
    backOffice: "Back office",
    logout: "Log out",
    accessibility: "Accessibility statement",
  },
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // בלי זה כל קישור במסגרת המחוברת הוביל לנתיב בלי קידומת /en, כלומר משתמש אנגלי
  // שלחץ "האתרים שלי" נזרק לעברית - ומכיוון שמחלף השפה לא הופיע כאן בכלל, לא היתה לו
  // שום דרך לחזור חוץ מעריכת הכתובת.
  const { lang, path } = useLang();
  const t = T[lang] || T.he;
  const plans = PLAN_LABELS[lang] || PLAN_LABELS.he;

  const doLogout = () => {
    logout();
    navigate(path("/login"));
  };

  return (
    <>
      {/* חייב להיות הרכיב הממוקד הראשון בעמוד - אחרת משתמש מקלדת עובר את כל הניווט מחדש
          בכל מעבר עמוד. מוסתר ויזואלית עד שהוא מקבל מיקוד. */}
      <a className="skip-link" href="#main-content">
        {t.skip}
      </a>

      <div className="app-shell">
      <nav className="navbar" aria-label={t.mainNav}>
        <div className="brand">
          MAGEN <span className="badge">{t.beta}</span>
        </div>

        {user && (
          <div className="nav-links">
            <NavLink to={path("/dashboard")} className={({ isActive }) => (isActive ? "active" : "")}>
              {t.mySites}
            </NavLink>
            {user.is_admin && (
              <NavLink to={path("/admin")} className={({ isActive }) => (isActive ? "active" : "")}>
                {t.backOffice}
              </NavLink>
            )}
          </div>
        )}

        {user && (
          <div className="user-area">
            <span className={`plan-pill ${user.plan}`}>{plans[user.plan] || user.plan}</span>
            <span>{user.email}</span>
            <LanguageSwitcher />
            <button className="btn btn-secondary btn-sm" onClick={doLogout}>
              {t.logout}
            </button>
          </div>
        )}
      </nav>

      <main id="main-content" className="page" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <span>MAGEN</span>
        <Link to={path("/accessibility")}>{t.accessibility}</Link>
      </footer>
      </div>

      <AccessibilityWidget />
    </>
  );
}
