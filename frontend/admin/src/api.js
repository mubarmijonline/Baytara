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

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req('/auth/me'),

  stats: () => req('/admin/stats'),

  // users
  users: (params) => req('/admin/users' + qs(params)),
  userCreate: (body) => req('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  userUpdate: (id, body) => req(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  userDelete: (id) => req(`/admin/users/${id}`, { method: 'DELETE' }),

  // categories
  categories: () => req('/categories'),
  categoryCreate: (body) => req('/admin/categories', { method: 'POST', body: JSON.stringify(body) }),
  categoryUpdate: (id, body) => req(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  categoryDelete: (id) => req(`/admin/categories/${id}`, { method: 'DELETE' }),

  // courses
  courses: (params) => req('/admin/courses' + qs(params)),
  course: (id) => req(`/admin/courses/${id}`),
  courseCreate: (body) => req('/admin/courses', { method: 'POST', body: JSON.stringify(body) }),
  courseUpdate: (id, body) => req(`/admin/courses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  courseDelete: (id) => req(`/admin/courses/${id}`, { method: 'DELETE' }),

  moduleCreate: (courseId, body) => req(`/admin/courses/${courseId}/modules`, { method: 'POST', body: JSON.stringify(body) }),
  moduleUpdate: (id, body) => req(`/admin/modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  moduleDelete: (id) => req(`/admin/modules/${id}`, { method: 'DELETE' }),

  lessonCreate: (moduleId, body) => req(`/admin/modules/${moduleId}/lessons`, { method: 'POST', body: JSON.stringify(body) }),
  lessonUpdate: (id, body) => req(`/admin/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  lessonDelete: (id) => req(`/admin/lessons/${id}`, { method: 'DELETE' }),

  // payments
  payments: (status) => req('/admin/payments' + (status ? `?status=${status}` : '')),
  approve: (id) => req(`/admin/payments/${id}/approve`, { method: 'POST' }),
  reject: (id, reason) => req(`/admin/payments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // instapay accounts
  accounts: () => req('/admin/instapay-accounts'),
  accountCreate: (body) => req('/admin/instapay-accounts', { method: 'POST', body: JSON.stringify(body) }),
  accountUpdate: (id, body) => req(`/admin/instapay-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

// Receipt image needs the bearer token, so fetch as a blob and hand back an object URL.
export async function fetchReceipt(id) {
  const r = await fetch(`${BASE}/admin/payments/${id}/receipt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('receipt_failed');
  return URL.createObjectURL(await r.blob());
}
