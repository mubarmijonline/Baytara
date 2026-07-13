import { useState } from 'react';
import { api, setToken } from './api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await api.login(email, password);
      if (res.user.role !== 'instructor') { setErr('هذا الحساب ليس مدرّباً.'); return; }
      setToken(res.access_token);
      onLogin(res.user);
    } catch (e2) {
      setErr(e2.status === 401 ? 'بيانات الدخول غير صحيحة.' : 'تعذّر تسجيل الدخول.');
    } finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <form className="card login-card" onSubmit={submit}>
        <h3 style={{ marginBottom: 18 }}>دخول المدرّب</h3>
        <div className="field"><label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {err && <div className="error-text" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-filled" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? '…' : 'دخول'}</button>
      </form>
    </div>
  );
}
