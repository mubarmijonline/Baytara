import { useState } from 'react';
import { getToken, setToken } from './api.js';
import Login from './Login.jsx';
import Shell from './Shell.jsx';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  return authed ? <Shell onLogout={() => { setToken(''); setAuthed(false); }} /> : <Login onLogin={() => setAuthed(true)} />;
}
