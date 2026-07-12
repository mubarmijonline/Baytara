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
