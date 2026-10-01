// Main-website API client (same origin: /api/v1). Read-only public endpoints.
import { useEffect, useState } from 'react';
import { thumbGradients } from '../theme/tokens.js';

const BASE = '/api/v1';
// Same base, exported for the handful of places that point an <img> or a link straight at
// an endpoint rather than fetching JSON through this client.
export const API_BASE = BASE;

// ---- language (contract البند1: AR default, EN toggle) ----
const LANG_KEY = 'baytara_lang';
export const getLang = () => {
  const params = new URLSearchParams(window.location.search);
  const previewLanguage = params.get('preview') === '1' ? params.get('lang') : '';
  if (previewLanguage === 'ar' || previewLanguage === 'en') return previewLanguage;
  return localStorage.getItem(LANG_KEY) || 'ar';
};
export const setLang = (l) => {
  localStorage.setItem(LANG_KEY, l === 'en' ? 'en' : 'ar');
  clearPublicCache();   // every cached body was localised by the old language
};

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

// ---- machine signature (contract البند2: two devices, counted per machine) ----
// A device id lives in localStorage, which browsers do not share, so Chrome, Firefox
// and Safari on one laptop looked like three devices. This is a coarse signature of the
// machine itself, built only from values every browser on it reports the same way.
//
// Deliberately coarse. Screen size, platform and timezone survive a browser update and
// a zoom change; CPU count and canvas hashes do not, and a signature that drifts locks
// people out — the failure we are fixing. The cost is that two identical laptops in one
// clinic can share a signature, which loosens the limit rather than breaking it.
const GROUP_KEY = 'baytara_device_group';

function platformClass() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'other';
}

export function getDeviceGroup() {
  let cached = '';
  try { cached = localStorage.getItem(GROUP_KEY) || ''; } catch { /* private mode */ }
  if (cached) return cached;
  let timezone = '';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* older browser */ }
  const parts = [platformClass(), `${window.screen?.width || 0}x${window.screen?.height || 0}`, timezone];
  // FNV-1a: this identifies a machine to our own server, it is not a secret.
  let hash = 0x811c9dc5;
  const raw = parts.join('|');
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const signature = `${parts[0]}-${hash.toString(16)}`;
  try { localStorage.setItem(GROUP_KEY, signature); } catch { /* fine, recomputed next time */ }
  return signature;
}

// Public reads that are identical for every visitor and change rarely. Without this they
// are refetched on every navigation -- categories and instructors alone are two round
// trips per page, and from Egypt each is a few hundred milliseconds of a page that looks
// like it is still loading. Held for the session only, in memory: a reload gets fresh data,
// and nothing user-specific is ever put in here.
const PUBLIC_TTL_MS = 5 * 60 * 1000;
const publicCache = new Map();

export function clearPublicCache() {
  publicCache.clear();
}

function cachedGet(path) {
  const key = getLang() + '|' + path;
  const hit = publicCache.get(key);
  if (hit && Date.now() - hit.at < PUBLIC_TTL_MS) return hit.promise;
  const promise = get(path).catch((error) => {
    // A failure must not be remembered, or one blip poisons the rest of the visit.
    publicCache.delete(key);
    throw error;
  });
  publicCache.set(key, { at: Date.now(), promise });
  return promise;
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
    // Renew if we can; a token that cannot be renewed is stale and worth dropping,
    // so the page falls back to the public view instead of retrying it forever.
    const renewed = getRefreshToken() ? await refreshAccessToken() : '';
    if (!renewed) logout();
    r = await fetch(url, { headers: {
      'Accept-Language': getLang(),
      ...(renewed ? { Authorization: `Bearer ${renewed}` } : {}),
    } });
  }
  if (!r.ok) throw Object.assign(new Error('http'), { status: r.status });
  return r.json();
}

// ---- student auth (JWT in localStorage) ----
//
// The access token lasts fifteen minutes. Nothing was renewing it, so a learner who
// read a lesson for a quarter of an hour was thrown out mid-video and had to sign in
// again. The API has issued a thirty-day refresh token from the start; this uses it.
const TOKEN_KEY = 'baytara_token';
const REFRESH_KEY = 'baytara_refresh';
export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY) || '';
export const setRefreshToken = (t) => (t ? localStorage.setItem(REFRESH_KEY, t) : localStorage.removeItem(REFRESH_KEY));
export const logout = () => { setToken(''); setRefreshToken(''); };
export const isAuthed = () => !!getToken();

// The book reader fetches the PDF itself rather than pointing an <iframe> at it, so it
// needs the same Authorization header every other authenticated call sends.
export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// One refresh at a time. Several requests expiring together must not each start their
// own, or they race and all but one of the new tokens is discarded.
let refreshing = null;
async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return '';
  if (!refreshing) {
    refreshing = fetch(BASE + '/auth/refresh', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        'X-Baytara-Device-ID': getDeviceId(),
        'X-Baytara-Device-Group': getDeviceGroup(),
      },
    }).then(async (r) => {
      if (!r.ok) { logout(); return ''; }
      const body = await r.json();
      if (body.access_token) setToken(body.access_token);
      if (body.refresh_token) setRefreshToken(body.refresh_token);
      return body.access_token || '';
    }).catch(() => '').finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function authFetch(path, opts = {}, retried = false) {
  const t = getToken();
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Baytara-Device-ID': getDeviceId(),
      'X-Baytara-Device-Group': getDeviceGroup(),
      ...(opts.headers || {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });
  // An expired access token is not the end of the session: renew it and replay the
  // call once. Only a refresh that itself fails means signing in again.
  if (r.status === 401 && !retried && getRefreshToken()) {
    if (await refreshAccessToken()) return authFetch(path, opts, true);
  }
  const j = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (r.status === 401) { logout(); throw Object.assign(new Error('unauthorized'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error((j && j.error) || 'error'), { status: r.status, data: j });
  return j;
}

// Multipart: the browser has to set Content-Type itself so the boundary is right,
// which is why this cannot go through authFetch.
async function authUpload(path, formData, retried = false) {
  const t = getToken();
  const r = await fetch(BASE + path, {
    method: 'POST',
    body: formData,
    headers: {
      'X-Baytara-Device-ID': getDeviceId(),
      'X-Baytara-Device-Group': getDeviceGroup(),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });
  if (r.status === 401 && !retried && getRefreshToken()) {
    if (await refreshAccessToken()) return authUpload(path, formData, true);
  }
  const j = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (r.status === 401) { logout(); throw Object.assign(new Error('unauthorized'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error((j && j.error) || 'error'), { status: r.status, data: j });
  return j;
}

export const auth = {
  register: (b) => authFetch('/auth/register', { method: 'POST', body: JSON.stringify({ ...b, device_id: getDeviceId() }) }),
  login: (b) => authFetch('/auth/login', { method: 'POST', body: JSON.stringify({ ...b, device_id: getDeviceId() }) }),
  // Google Sign-In: the client id comes from the API so it stays in one place
  // (backend .env) and needs no frontend rebuild to change.
  googleConfig: () => authFetch('/auth/google-config'),
  google: (credential) => authFetch('/auth/google', { method: 'POST', body: JSON.stringify({ credential, device_id: getDeviceId() }) }),
  logoutServer: () => authFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ device_id: getDeviceId() }) }).catch(() => {}),
  me: () => authFetch('/auth/me'),
  profile: (body) => authFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAccount: (password) => authFetch('/auth/account', { method: 'DELETE', body: JSON.stringify({ confirm: true, password }) }),
  devices: () => authFetch('/auth/devices'),
  removeDevice: (id) => authFetch(`/auth/devices/${id}`, { method: 'DELETE' }),
  requestDeviceSwap: (reason) => authFetch('/auth/devices/swap-requests', { method: 'POST', body: JSON.stringify({ reason }) }),
  enrollments: () => authFetch('/enrollments'),
  enroll: (course_id) => authFetch('/enrollments', { method: 'POST', body: JSON.stringify({ course_id }) }),
  // baytarian (verified pet-doctor) status + verification request
  baytarianMe: () => authFetch('/baytarian/me'),
  // Card verification: preview reads the card without committing, submit verifies.
  baytarianCard: (front, back, preview = false) => {
    const fd = new FormData();
    fd.append('front', front);
    fd.append('back', back);
    // Through authUpload so an expired token renews itself: reading a card can take
    // a while, and losing the upload to a timed-out session is the worst moment for it.
    return authUpload(`/baytarian/card${preview ? '/preview' : ''}`, fd);
  },
  // Any other document — national ID or a college card. One or two images; the back
  // is optional because a student card often has nothing worth photographing on it.
  baytarianDocument: (route, front, back) => {
    const fd = new FormData();
    fd.append('route', route);
    fd.append('front', front);
    if (back) fd.append('back', back);
    return authUpload('/baytarian/document', fd);
  },
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
  playback: (lesson_id, course_id) => authFetch('/video/playback', {
    method: 'POST', body: JSON.stringify({ lesson_id, ...(course_id ? { course_id } : {}) }),
  }),
  playbackEvent: (sessionId, event) => authFetch(`/video/playback-sessions/${sessionId}/events`, {
    method: 'POST', body: JSON.stringify(event),
  }),
  videoProgress: () => authFetch('/video/my-progress'),
  learningSummary: () => authFetch('/learning-summary'),
  certificates: () => authFetch('/certificates'),
  exam: (slug) => authFetch('/courses/' + slug + '/exam'),
  // paperToken ties the submission to the paper that was issued: it carries which
  // questions were drawn and when, both of which the server needs and neither of which it
  // can take from the candidate. See backend/app/services/exam_paper.py.
  examSubmit: (slug, answers, paperToken) => authFetch('/courses/' + slug + '/exam/attempts', {
    method: 'POST', body: JSON.stringify({ answers, paper_token: paperToken }),
  }),
  activity: (params) => authFetch('/activity' + qs(params)),
  nationalIdCard: (file) => {
    const form = new FormData();
    form.append('file', file);
    return authUpload('/auth/national-id', form);
  },
  profileImage: (kind, file) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    return authUpload('/auth/profile/image', form);
  },
  reviewCourse: (slug, body) => authFetch(`/courses/${slug}/reviews`, {
    method: 'POST', body: JSON.stringify(body),
  }),
  deleteMyReview: (slug) => authFetch(`/courses/${slug}/reviews/mine`, { method: 'DELETE' }),
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
  // What this browser would be told at mint time, asked before minting.
  capabilities: () => get('/video/capabilities'),
  courses: (params) => get('/courses' + qs(params)),
  course: (slug) => get('/courses/' + slug),
  completionCertificate: (serial) => get('/completion-certificates/' + encodeURIComponent(serial)),
  books: () => get('/books'),
  book: (slug) => get('/books/' + encodeURIComponent(slug)),
  courseReviews: (slug, params) => get(`/courses/${slug}/reviews` + qs(params)),
  videos: (params) => get('/videos' + qs(params), true),
  video: (id) => get('/videos/' + id, true),
  categories: () => cachedGet('/categories'),
  bundles: () => get('/bundles'),
  bundle: (slug) => get('/bundles/' + slug),
  certificate: (serial) => get('/certificates/' + serial),
  paths: () => get('/paths'),
  path: (slug) => get('/paths/' + slug),
  instructors: () => cachedGet('/instructors'),
  instructor: (id) => get('/instructors/' + id),
  instapayAccounts: () => get('/payment/instapay/accounts'),
  articles: (type) => get('/articles' + qs({ type })),
  article: (slug) => get('/articles/' + slug),
  settings: () => cachedGet('/settings'),
  contact: (body) =>
    fetch(BASE + '/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

// Short number for tight card lines: 84000 -> "٨٤ ألف" / "84K". Intl does the locale work.
export function compact(n, lang) {
  return new Intl.NumberFormat(lang === 'en' ? 'en' : 'ar-EG', { notation: 'compact' }).format(n || 0);
}

// Map an API course to the shape the approved design expects. Numbers stay real:
// anything the platform doesn't measure yet (ratings) comes back null so the UI
// can hide it instead of printing a made-up figure.
export function mapCourse(c, i = 0) {
  const minutes = c.video_minutes || c.duration_minutes || 0;
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    instructorId: c.instructor?.id ?? null,
    instructor: c.instructor?.name || '',
    instructorHeadline: c.instructor?.headline || '',
    instructorAvatar: c.instructor?.avatar_url || '',
    ini: (c.instructor?.name || '؟').trim().charAt(0),
    cat: c.category?.name || '',
    rating: c.rating ?? null,
    lessons: c.lessons_count ?? 0,
    minutes,
    hours: minutes ? Math.round((minutes / 60) * 10) / 10 : 0,
    videos: c.videos || [],
    learners: c.enrolled_count != null ? String(c.enrolled_count) : '0',
    grad: thumbGradients[i % thumbGradients.length],
    price: c.price,
    currency: c.currency,
    description: c.description,
    image: c.image,
    access_type: c.access_type,
    level: c.level || 'beginner',
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
