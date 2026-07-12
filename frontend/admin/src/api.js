const BASE = '/api/v1';
let token = localStorage.getItem('baytara_admin_token') || '';

export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('baytara_admin_token', t);
  else localStorage.removeItem('baytara_admin_token');
}

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const data = isJson ? await r.json() : null;
  if (r.status === 401) {
    setToken('');
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || 'error'), { status: r.status, data });
  return data;
}

export const api = {
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  queue: (status) => req('/admin/payments' + (status ? `?status=${status}` : '')),
  approve: (id) => req(`/admin/payments/${id}/approve`, { method: 'POST' }),
  reject: (id, reason) => req(`/admin/payments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

// Receipt image needs the bearer token, so fetch as a blob and hand back an object URL.
export async function fetchReceipt(id) {
  const r = await fetch(`${BASE}/admin/payments/${id}/receipt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('receipt_failed');
  return URL.createObjectURL(await r.blob());
}
