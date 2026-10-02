import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import { LangProvider, useRootLanguageRedirect } from "./lib/LangContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import SiteDetail from "./pages/SiteDetail";
import Admin from "./pages/Admin";
import AccessibilityStatement from "./pages/AccessibilityStatement";
import ScanReport from "./pages/ScanReport";
import Landing from "./pages/Landing";
import PublicScan from "./pages/PublicScan";

// MAGEN - הניתוב.
// ==========================================================================================
// שתי שפות, שתי קידומות: עברית בשורש, אנגלית תחת /en. אותו עץ מסלולים נרשם פעמיים, כי
// לכל שפה צריכה להיות כתובת נפרדת שגוגל מאנדקס לחוד - אחרת האנגלית לא מדורגת, וזו כל
// הסיבה שהוספנו אותה. השפה עצמה נקראת מהכתובת ב-LangProvider.

function routesFor(prefix, user) {
  const p = (path) => `${prefix}${path}`;
  const to = (path) => `${prefix}${path}`;

  return [
    <Route
      key={`${prefix}-login`}
      path={p("/login")}
      element={user ? <Navigate to={to("/dashboard")} replace /> : <Login />}
    />,
    <Route
      key={`${prefix}-signup`}
      path={p("/signup")}
      element={user ? <Navigate to={to("/dashboard")} replace /> : <Signup />}
    />,
    <Route
      key={`${prefix}-forgot`}
      path={p("/forgot-password")}
      element={user ? <Navigate to={to("/dashboard")} replace /> : <ForgotPassword />}
    />,
    // בלי הפניה למשתמש מחובר: מי שפותח קישור איפוס צריך להגיע לטופס גם אם הדפדפן הזה
    // מחובר (למשל לחשבון אחר, או כשמישהו אחר נכנס בשמו - בדיוק המקרה שהאיפוס פותר).
    <Route key={`${prefix}-reset`} path={p("/reset-password")} element={<ResetPassword />} />,

    <Route
      key={`${prefix}-dashboard`}
      path={p("/dashboard")}
      element={
        <ProtectedRoute>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${prefix}-site`}
      path={p("/sites/:siteId")}
      element={
        <ProtectedRoute>
          <Layout>
            <SiteDetail />
          </Layout>
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${prefix}-admin`}
      path={p("/admin")}
      element={
        <ProtectedRoute requireAdmin>
          <Layout>
            <Admin />
          </Layout>
        </ProtectedRoute>
      }
    />,

    // דוח הלקוח נפתח ללא ה-Layout של האפליקציה (ניווט, פוטר, ווידג'ט הנגישות) - הוא
    // נועד לצאת כ-PDF, וכל מה שאינו חלק מהדוח עצמו לא אמור להופיע בו.
    <Route
      key={`${prefix}-report`}
      path={p("/report/:scanId")}
      element={
        <ProtectedRoute>
          <ScanReport />
        </ProtectedRoute>
      }
    />,

    // תוצאת סריקה שבעל אתר מאומת בחר לפרסם. ציבורי לחלוטין ואינדקסבילי - זו נקודת
    // הכניסה של מי שקיבל קישור בוואטסאפ ולא מכיר את MAGEN.
    <Route key={`${prefix}-public-scan`} path={p("/s/:slug")} element={<PublicScan />} />,

    // הצהרת הנגישות חייבת להיות נגישה לכל אחד, גם למי שאינו מחובר - זו דרישה
    // פורמלית וגם דבר שלקוח פוטנציאלי בודק לפני שהוא נרשם.
    <Route key={`${prefix}-a11y`} path={p("/accessibility")} element={<AccessibilityStatement />} />,

    // עמוד הבית הציבורי. משתמש מחובר ממשיך ישר לדשבורד.
    <Route
      key={`${prefix}-home`}
      path={prefix || "/"}
      element={user ? <Navigate to={to("/dashboard")} replace /> : <Landing />}
    />,
  ];
}

// ההפניה של "כתובת לא נמצאה", עם שמירת שפת הכתובת שממנה הגיע המבקר.
function NotFoundRedirect({ user }) {
  const { pathname } = useLocation();
  const prefix = pathname === "/en" || pathname.startsWith("/en/") ? "/en" : "";
  return <Navigate to={user ? `${prefix}/dashboard` : prefix || "/"} replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  useRootLanguageRedirect();

  return (
    <Routes>
      {routesFor("/en", user)}
      {routesFor("", user)}
      {/* כתובת לא מוכרת: מחזירים לשורש ולא למסך התחברות, כדי שמבקר חדש שהקליק על
          קישור שבור יראה מה המוצר עושה במקום טופס. הקידומת נשמרת - אחרת כל שגיאת
          הקלדה בצד האנגלי היתה זורקת את המבקר לעברית בלי דרך חזרה. */}
      <Route path="*" element={<NotFoundRedirect user={user} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AppRoutes />
    </LangProvider>
  );
}
