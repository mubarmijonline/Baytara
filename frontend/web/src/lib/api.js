// Main-website API client (same origin: /api/v1). Read-only public endpoints.
import { useEffect, useState } from 'react';
import { thumbGradients } from '../theme/tokens.js';

const BASE = '/api/v1';

// ---- language (contract البند1: AR default, EN toggle) ----
const LANG_KEY = 'baytara_lang';
export const getLang = () => {
  const params = new URLSearchParams(window.location.search);
  const previewLanguage = params.get('preview') === '1' ? params.get('lang') : '';
  if (previewLanguage === 'ar' || previewLanguage === 'en') return previewLanguage;
  return localStorage.getItem(LANG_KEY) || 'ar';
};
export const setLang = (l) => { localStorage.setItem(LANG_KEY, l === 'en' ? 'en' : 'ar'); };

// ---- stable device id (contract البند2: 2-device limit) ----
const DEVICE_KEY = 'baytara_device_id';
export function getDeviceId() {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) {
    d = (crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem(DEVICE_KEY, d);
  }
  return d;
}

const qs = (p) => {
  const s = new URLSearchParams(Object.entries(p || {}).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};
// Append the active language so the API returns localized content.
const withLang = (path) => path + (path.includes('?') ? '&' : '?') + 'lang=' + getLang();
async function get(path, includeAuth = false) {
  const token = includeAuth ? getToken() : '';
  const url = BASE + withLang(path);
  let r = await fetch(url, { headers: {
    'Accept-Language': getLang(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  } });
  if (includeAuth && token && r.status === 401) {
    setToken('');
    r = await fetch(url, { headers: { 'Accept-Language': getLang() } });
  }
  if (!r.ok) throw Object.assign(new Error('http'), { status: r.status });
  return r.json();
}

// ---- student auth (JWT in localStorage) ----
const TOKEN_KEY = 'baytara_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const logout = () => setToken('');
export const isAuthed = () => !!getToken();

async function authFetch(path, opts = {}) {
  const t = getToken();
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });
  const j = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (r.status === 401) { setToken(''); throw Object.assign(new Error('unauthorized'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error((j && j.error) || 'error'), { status: r.status, data: j });
  return j;
}

export const auth = {
  register: (b) => authFetch('/auth/register', { method: 'POST', body: JSON.stringify({ ...b, device_id: getDeviceId() }) }),
  login: (b) => authFetch('/auth/login', { method: 'POST', body: JSON.stringify({ ...b, device_id: getDeviceId() }) }),
  logoutServer: () => authFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ device_id: getDeviceId() }) }).catch(() => {}),
  me: () => authFetch('/auth/me'),
  devices: () => authFetch('/auth/devices'),
  removeDevice: (id) => authFetch(`/auth/devices/${id}`, { method: 'DELETE' }),
  enrollments: () => authFetch('/enrollments'),
  enroll: (course_id) => authFetch('/enrollments', { method: 'POST', body: JSON.stringify({ course_id }) }),
  // baytarian (verified pet-doctor) status + verification request
  baytarianMe: () => authFetch('/baytarian/me'),
  baytarianRequest: (files, note) => {
    const fd = new FormData();
    (files || []).forEach((f) => fd.append('documents', f));
    if (note) fd.append('note', note);
    return fetch(BASE + '/baytarian/request', {
      method: 'POST', headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body: fd,
    }).then(async (r) => {
      const j = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
      if (!r.ok) throw Object.assign(new Error((j && j.error) || 'error'), { status: r.status, data: j });
      return j;
    });
  },
  progress: (b) => authFetch('/progress', { method: 'POST', body: JSON.stringify(b) }),
  progressGet: (slug) => authFetch('/progress?course=' + encodeURIComponent(slug)),
  playback: (lesson_id) => authFetch('/video/playback', { method: 'POST', body: JSON.stringify({ lesson_id }) }),
  notifications: () => authFetch('/notifications'),
  notifRead: (id) => authFetch(`/notifications/${id}/read`, { method: 'POST' }),
  notifReadAll: () => authFetch('/notifications/read-all', { method: 'POST' }),
  // price/title before checkout (kind: enroll|renewal|bundle)
  quote: (params) => authFetch('/payment/quote' + qs(params)),
  // Fawaterak checkout -> { url, payment_id }; redirect the browser to url
  checkout: (body) => authFetch('/payment/checkout', { method: 'POST', body: JSON.stringify(body) }),
  paymentStatus: (id) => authFetch(`/payment/${id}`),
  myPayments: () => authFetch('/payment/mine'),
};

export const webapi = {
  courses: (params) => get('/courses' + qs(params)),
  course: (slug) => get('/courses/' + slug),
  videos: (params) => get('/videos' + qs(params), true),
  video: (id) => get('/videos/' + id, true),
  categories: () => get('/categories'),
  bundles: () => get('/bundles'),
  bundle: (slug) => get('/bundles/' + slug),
  instructors: () => get('/instructors'),
  instructor: (id) => get('/instructors/' + id),
  instapayAccounts: () => get('/payment/instapay/accounts'),
  articles: (type) => get('/articles' + qs({ type })),
  article: (slug) => get('/articles/' + slug),
  settings: () => get('/settings'),
  contact: (body) =>
    fetch(BASE + '/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

// Map an API course to the shape the approved design expects (fills display-only fields).
export function mapCourse(c, i = 0) {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    instructor: c.instructor?.name || '',
    ini: (c.instructor?.name || '؟').trim().charAt(0),
    cat: c.category?.name || '',
    rating: c.rating || '4.8',
    lessons: c.lessons_count || c.lessons || 0,
    hours: c.duration_minutes ? Math.round(c.duration_minutes / 60) : 0,
    learners: c.enrolled_count != null ? String(c.enrolled_count) : '0',
    grad: thumbGradients[i % thumbGradients.length],
    price: c.price,
    currency: c.currency,
    description: c.description,
    image: c.image,
    access_type: c.access_type,
    is_paid: c.is_paid,
    lock_reason: c.lock_reason,
    _api: true,
  };
}

// Fetch hook: returns { data, error, loading }. Deps default to [].
export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}
