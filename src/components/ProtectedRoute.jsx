import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

// עוטף נתיבים שדורשים התחברות. אם אין משתמש מחובר - מפנה ל-/login.
// requireAdmin=true גם חוסם משתמשים לא-אדמין מנתיבי הבק-אופיס (סעיף 4, 6 במפרט).
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !user.is_admin) return <Navigate to="/dashboard" replace />;

  return children;
}
