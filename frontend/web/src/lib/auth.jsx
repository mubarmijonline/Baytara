import { createContext, useContext, useEffect, useState } from 'react';
import { auth, getToken, logout as clearTokens, setRefreshToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  // rehydrate the session on load: if we hold a token, ask the API who we are
  useEffect(() => {
    if (!getToken()) return;
    auth.me()
      .then((r) => setUser(r.user))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await auth.login({ email, password });
    setToken(res.access_token);
    // Kept so the session outlives the fifteen-minute access token.
    setRefreshToken(res.refresh_token);
    setUser(res.user);
    return res.user;
  }
  async function register(name, email, password, phone) {
    const res = await auth.register({ name, email, password, phone });
    setToken(res.access_token);
    setRefreshToken(res.refresh_token);
    setUser(res.user);
    return res.user;
  }
  // Google hands us an ID token; the API verifies it and mints our own tokens.
  async function loginWithGoogle(credential) {
    const res = await auth.google(credential);
    setToken(res.access_token);
    setRefreshToken(res.refresh_token);
    setUser(res.user);
    return res.user;
  }
  // Accepts a plain phone string (the old call sites) or a field object.
  async function updateProfile(patch) {
    const res = await auth.profile(typeof patch === 'string' ? { phone: patch } : patch);
    setUser(res.user);
    return res.user;
  }
  async function uploadProfileImage(kind, file) {
    const res = await auth.profileImage(kind, file);
    setUser(res.user);
    return res.user;
  }
  // Re-read the account after something server-side changed it — verification grants a
  // status the client never sent, so the local copy is stale until it asks.
  async function refresh() {
    if (!getToken()) return null;
    const res = await auth.me();
    setUser(res.user);
    return res.user;
  }
  // Closing the account ends the session with it. No server logout: the devices are
  // already gone with the account, and the call would only fail.
  async function closeAccount(password) {
    await auth.deleteAccount(password);
    clearTokens();
    setUser(null);
  }
  function logout() {
    auth.logoutServer();
    clearTokens();
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, loginWithGoogle, updateProfile, uploadProfileImage, refresh, logout, closeAccount }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
