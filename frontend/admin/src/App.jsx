import { useState } from 'react';
import { getToken, setToken } from './api.js';
import Login from './Login.jsx';
import Queue from './Queue.jsx';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());

  function logout() {
    setToken('');
    setAuthed(false);
  }

  return authed ? <Queue onLogout={logout} /> : <Login onLogin={() => setAuthed(true)} />;
}
