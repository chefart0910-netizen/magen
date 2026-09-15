import { createContext, useContext, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // בלי try/catch כאן, כל חלון שבו אחסון האתר חסום (ספארי פרטי, חסימת צד-שלישי) או
    // כל ערך פגום ב-localStorage הפילו את כל האפליקציה למסך לבן בזמן הרינדור הראשון,
    // בלי דרך להתאושש. שאר הקוד (i18n, ווידג'ט הנגישות) כבר מגן על עצמו כך.
    try {
      const raw = localStorage.getItem("magen_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      try {
        localStorage.removeItem("magen_user");
      } catch {
        // אין מה לעשות - ממשיכים כאורח.
      }
      return null;
    }
  });

  const persist = (token, user) => {
    try {
      localStorage.setItem("magen_token", token);
      localStorage.setItem("magen_user", JSON.stringify(user));
    } catch {
      // אחסון חסום: ההתחברות עדיין תקפה לטאב הזה, היא פשוט לא תישמר לרענון הבא.
    }
    setUser(user);
  };

  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password });
    persist(data.token, data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, password, full_name, extra = {}) => {
    const data = await api.register({ email, password, full_name, ...extra });
    persist(data.token, data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem("magen_token");
      localStorage.removeItem("magen_user");
    } catch {
      // אחסון חסום - אין מה לנקות.
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
