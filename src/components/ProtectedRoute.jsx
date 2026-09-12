import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../lib/AuthContext";
import { useLang } from "../lib/LangContext";

// עוטף נתיבים שדורשים התחברות. אם אין משתמש מחובר - מפנה ל-/login.
// requireAdmin=true גם חוסם משתמשים לא-אדמין מנתיבי הבק-אופיס (סעיף 4, 6 במפרט).
//
// noindex לכל מה שמאחורי התחברות: דשבורד, אתרי לקוח, בק-אופיס ודוחות הם עמודים פרטיים,
// ואין שום מצב שבו נרצה אותם בגוגל - גם אם כתובת נדלפה או שותפה בטעות. זה נמצא כאן ולא
// בכל עמוד בנפרד, כי ProtectedRoute הוא הצוואר שכולם עוברים בו.
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user } = useAuth();
  // ההפניות שומרות את קידומת השפה, אחרת משתמש שעבד באנגלית נזרק לעברית.
  const { path } = useLang();

  if (!user) return <Navigate to={path("/login")} replace />;
  if (requireAdmin && !user.is_admin) return <Navigate to={path("/dashboard")} replace />;

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {children}
    </>
  );
}
