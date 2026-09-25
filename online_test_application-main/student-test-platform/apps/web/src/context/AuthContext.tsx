import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { User } from '../types/app';

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (name: string, password: string) => Promise<User>;
  signup: (name: string, password: string, course: string, mobileNumber: string, avatarId?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'student-test-platform-auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setLoading(false);
      return;
    }

    const parsed = JSON.parse(raw) as { token: string; user: User };
    setToken(parsed.token);
    setUser(parsed.user);

    api.me(parsed.token)
      .then((response) => setUser(response.user))
      .catch(() => {
        sessionStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const response = await api.login({ name, password });
    setToken(response.token);
    setUser(response.user);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(response));
    return response.user;
  }, []);

  const signup = useCallback(async (name: string, password: string, course: string, mobileNumber: string, avatarId?: string) => {
    const response = await api.studentSignup({ name, password, course, mobileNumber, avatarId });
    setToken(response.token);
    setUser(response.user);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(response));
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Deliberately depends only on `token`, not `user` — this is called from
  // polling effects (e.g. ProfilePage) that list it as a dependency. If its
  // identity changed every time it ran (which it would if `user` were a
  // dependency here, since it calls setUser itself), those effects would
  // re-fire immediately after every call, looping as fast as the network
  // allows instead of on their intended interval.
  const refreshUser = useCallback(async () => {
    if (!token) return;
    const response = await api.me(token);
    setUser(response.user);
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { token: string; user: User };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, user: response.user }));
    }
  }, [token]);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    loading,
    login,
    signup,
    logout,
    refreshUser,
  }), [token, user, loading, login, signup, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
