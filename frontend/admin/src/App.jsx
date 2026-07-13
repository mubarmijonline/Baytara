import { useState } from 'react';
import { getToken, setToken } from './api.js';
import Login from './Login.jsx';
import Shell from './Shell.jsx';
import { Toaster } from './toast.jsx';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  function logout() {
    setToken('');
    setAuthed(false);
  }
  return (
    <>
      <Toaster />
      {authed ? <Shell onLogout={logout} /> : <Login onLogin={() => setAuthed(true)} />}
    </>
  );
}
