import { createContext, useContext, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("magen_user");
    return raw ? JSON.parse(raw) : null;
  });

  const persist = (token, user) => {
    localStorage.setItem("magen_token", token);
    localStorage.setItem("magen_user", JSON.stringify(user));
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
    localStorage.removeItem("magen_token");
    localStorage.removeItem("magen_user");
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
