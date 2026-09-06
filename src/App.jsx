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

      {/* הצהרת הנגישות חייבת להיות נגישה לכל אחד, גם למי שאינו מחובר - זו דרישה
          פורמלית וגם דבר שלקוח פוטנציאלי בודק לפני שהוא נרשם. */}
      <Route path="/accessibility" element={<AccessibilityStatement />} />

      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
