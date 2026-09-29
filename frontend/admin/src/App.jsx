import { useState } from 'react';
import { clearSession, getToken } from './api.js';
import Login from './Login.jsx';
import { AdminRoutes } from './routes.jsx';
import { Toaster } from './toast.jsx';
import { DialogHost } from './dialog.jsx';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  function logout() {
    clearSession();
    setAuthed(false);
  }
  return (
    <>
      <Toaster />
      <DialogHost />
      {authed ? <AdminRoutes onLogout={logout} /> : <Login onLogin={() => setAuthed(true)} />}
    </>
  );
}
