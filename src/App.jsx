import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import SiteDetail from "./pages/SiteDetail";
import Admin from "./pages/Admin";
import AccessibilityStatement from "./pages/AccessibilityStatement";
import ScanReport from "./pages/ScanReport";
import Landing from "./pages/Landing";

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/dashboard" replace /> : <Signup />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sites/:siteId"
        element={
          <ProtectedRoute>
            <Layout>
              <SiteDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <Layout>
              <Admin />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* דוח הלקוח נפתח ללא ה-Layout של האפליקציה (ניווט, פוטר, ווידג'ט הנגישות) - הוא
          נועד לצאת כ-PDF, וכל מה שאינו חלק מהדוח עצמו לא אמור להופיע בו. */}
      <Route
        path="/report/:scanId"
        element={
          <ProtectedRoute>
            <ScanReport />
          </ProtectedRoute>
        }
      />

      {/* הצהרת הנגישות חייבת להיות נגישה לכל אחד, גם למי שאינו מחובר - זו דרישה
          פורמלית וגם דבר שלקוח פוטנציאלי בודק לפני שהוא נרשם. */}
      <Route path="/accessibility" element={<AccessibilityStatement />} />

      {/* עמוד הבית הציבורי. עד עכשיו "/" הפנה ל-/login, כלומר גולש חדש וגוגל ראו מסך
          התחברות ולא הבינו מה המוצר עושה. משתמש מחובר ממשיך ישר לדשבורד. */}
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
