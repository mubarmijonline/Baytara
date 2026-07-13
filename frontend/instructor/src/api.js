const BASE = '/api/v1';
let token = localStorage.getItem('baytara_instructor_token') || '';
export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('baytara_instructor_token', t);
  else localStorage.removeItem('baytara_instructor_token');
}

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const data = isJson ? await r.json() : null;
  if (r.status === 401) { setToken(''); throw Object.assign(new Error('unauthorized'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || 'error'), { status: r.status, data });
  return data;
}

export const api = {
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  stats: () => req('/instructor/stats'),
  permissions: () => req('/instructor/permissions'),
  courses: () => req('/instructor/courses'),
  course: (id) => req('/instructor/courses/' + id),
  courseCreate: (b) => req('/instructor/courses', { method: 'POST', body: JSON.stringify(b) }),
  courseUpdate: (id, b) => req('/instructor/courses/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  courseDelete: (id) => req('/instructor/courses/' + id, { method: 'DELETE' }),
  moduleCreate: (cid, b) => req(`/instructor/courses/${cid}/modules`, { method: 'POST', body: JSON.stringify(b) }),
  moduleDelete: (id) => req('/instructor/modules/' + id, { method: 'DELETE' }),
  lessonCreate: (mid, b) => req(`/instructor/modules/${mid}/lessons`, { method: 'POST', body: JSON.stringify(b) }),
  lessonUpdate: (id, b) => req('/instructor/lessons/' + id, { method: 'PATCH', body: JSON.stringify(b) }),
  lessonDelete: (id) => req('/instructor/lessons/' + id, { method: 'DELETE' }),
  students: () => req('/instructor/students'),
  payments: () => req('/instructor/payments'),
  categories: () => req('/categories'),
};
