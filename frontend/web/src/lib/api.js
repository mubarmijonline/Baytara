// Main-website API client (same origin: /api/v1). Read-only public endpoints.
import { useEffect, useState } from 'react';
import { thumbGradients } from '../theme/tokens.js';

const BASE = '/api/v1';
const qs = (p) => {
  const s = new URLSearchParams(Object.entries(p || {}).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};
async function get(path) {
  const r = await fetch(BASE + path);
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
  register: (b) => authFetch('/auth/register', { method: 'POST', body: JSON.stringify(b) }),
  login: (b) => authFetch('/auth/login', { method: 'POST', body: JSON.stringify(b) }),
  me: () => authFetch('/auth/me'),
  enrollments: () => authFetch('/enrollments'),
  enroll: (course_id) => authFetch('/enrollments', { method: 'POST', body: JSON.stringify({ course_id }) }),
  progress: (b) => authFetch('/progress', { method: 'POST', body: JSON.stringify(b) }),
  progressGet: (slug) => authFetch('/progress?course=' + encodeURIComponent(slug)),
};

export const webapi = {
  courses: (params) => get('/courses' + qs(params)),
  course: (slug) => get('/courses/' + slug),
  categories: () => get('/categories'),
  instructor: (id) => get('/instructors/' + id),
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
    _api: true,
  };
}

// Site settings hook: returns the {key: value} map (empty object until loaded).
// Pages read e.g. settings.hero?.title ?? mockDefault.
export function useSettings() {
  const { data } = useFetch(() => webapi.settings(), []);
  return data?.settings || {};
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
