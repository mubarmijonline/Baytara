import { useState } from 'react';
import { api, setToken } from './api.js';
import { useAdminLanguage } from './i18n.jsx';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { t } = useAdminLanguage();

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await api.login(email, password);
      if (res.user.role !== 'admin') {
        setErr(t('login.notAdmin'));
        return;
      }
      setToken(res.access_token);
      onLogin(res.user);
    } catch (e2) {
      setErr(e2.status === 401 ? t('login.invalid') : t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <form className="card login-card" onSubmit={submit}>
        <h3 style={{ marginBottom: 18 }}>{t('login.title')}</h3>
        <div className="field">
          <label htmlFor="admin-email">{t('login.email')}</label>
          <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="admin-password">{t('login.password')}</label>
          <input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {err && <div className="error-text" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-filled" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? '…' : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
