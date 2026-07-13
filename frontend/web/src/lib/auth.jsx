import { createContext, useContext, useEffect, useState } from 'react';
import { auth, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  // rehydrate the session on load: if we hold a token, ask the API who we are
  useEffect(() => {
    if (!getToken()) return;
    auth.me()
      .then((r) => setUser(r.user))
      .catch(() => setToken(''))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await auth.login({ email, password });
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }
  async function register(name, email, password) {
    const res = await auth.register({ name, email, password });
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }
  function logout() {
    setToken('');
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
