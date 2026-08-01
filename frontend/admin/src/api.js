import { withAdminStatsInvalidation } from './admin-stats.js';

const BASE = '/api/v1';
let token = localStorage.getItem('baytara_admin_token') || '';

export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('baytara_admin_token', t);
  else localStorage.removeItem('baytara_admin_token');
}

async function req(path, opts = {}) {
  const { clearTokenOn401 = true, ...fetchOptions } = opts;
  const r = await fetch(BASE + path, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const data = isJson ? await r.json() : null;
  if (r.status === 401) {
    if (clearTokenOn401) setToken('');
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || 'error'), { status: r.status, data });
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};

async function blobReq(path) {
  const response = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) {
    setToken('');
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  if (!response.ok) throw Object.assign(new Error('download_failed'), { status: response.status });
  return response.blob();
}

export const api = {
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req('/auth/me'),

  stats: ({ deferUnauthorized = false } = {}) => req('/admin/stats', { clearTokenOn401: !deferUnauthorized }),

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

  // videos (directly under a course, ordered; or standalone)
  videos: (params) => req('/admin/videos' + qs(params)),
  catalogVideos: (params) => req('/admin/videos' + qs(params)),
  videoLibrary: (params, { signal } = {}) => req('/admin/video-library' + qs(params), { signal }),
  video: (id) => req(`/admin/videos/${id}`),
  videoCreate: (body) => req('/admin/videos', { method: 'POST', body: JSON.stringify(body) }),
  videoUpdate: (id, body) => req(`/admin/videos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  videoDelete: (id) => req(`/admin/videos/${id}`, { method: 'DELETE' }),
  videoCoursesSet: (id, course_ids) => req(`/admin/videos/${id}/courses`, { method: 'POST', body: JSON.stringify({ course_ids }) }),
  videoCoursesAdd: (id, course_ids) => req(`/admin/videos/${id}/courses/add`, { method: 'POST', body: JSON.stringify({ course_ids }) }),
  videoCourseRemove: (id, courseId) => req(`/admin/videos/${id}/courses/${courseId}`, { method: 'DELETE' }),
  courseVideoOrder: (courseId, video_ids) => req(`/admin/courses/${courseId}/videos/order`, { method: 'PUT', body: JSON.stringify({ video_ids }) }),
  videosReorder: (courseId, order) => req(`/admin/courses/${courseId}/videos/reorder`, { method: 'POST', body: JSON.stringify({ order }) }),
  vdocipherTest: () => req('/admin/vdocipher/test', { method: 'POST' }),
  vdocipherSyncFolders: (body) => req('/admin/vdocipher/sync-folders', { method: 'POST', body: JSON.stringify(body || {}) }),
  vdocipherVideos: (params) => req('/admin/vdocipher/videos' + qs(params)),
  vdocipherVideo: (id) => req(`/admin/vdocipher/videos/${id}`),
  vdocipherVideoUpdate: (id, body) => req(`/admin/vdocipher/videos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  vdocipherPreview: (id) => req(`/admin/vdocipher/videos/${id}/preview`, { method: 'POST' }),
  vdocipherFolder: (id, params) => req(`/admin/vdocipher/folders/${id}` + qs(params)),
  vdocipherFolderCreate: (body) => req('/admin/vdocipher/folders', { method: 'POST', body: JSON.stringify(body) }),
  vdocipherFolderRename: (id, body) => req(`/admin/vdocipher/folders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  vdocipherFolderDelete: (id) => req(`/admin/vdocipher/folders/${id}`, { method: 'DELETE' }),
  vdocipherMove: (body) => req('/admin/vdocipher/move', { method: 'POST', body: JSON.stringify(body) }),
  vdocipherUploadCredentials: (body) => req('/admin/vdocipher/upload-credentials', { method: 'POST', body: JSON.stringify(body) }),
  vdocipherImport: (body) => req('/admin/vdocipher/import', { method: 'POST', body: JSON.stringify(body) }),

  // Baytara-owned playback security and viewing reports
  videoReportSummary: (params) => req('/admin/video-reports/summary' + qs(params)),
  videoReportSessions: (params) => req('/admin/video-reports/sessions' + qs(params)),
  videoReportSession: (id) => req(`/admin/video-reports/sessions/${id}`),
  downloadVideoReport: (params) => blobReq('/admin/video-reports/export.csv' + qs(params)),

  // baytarian verification requests
  baytarianRequests: (status) => req('/admin/baytarian-requests' + (status ? `?status=${status}` : '')),
  baytarianApprove: (id) => withAdminStatsInvalidation(
    () => req(`/admin/baytarian-requests/${id}/approve`, { method: 'POST' }),
  ),
  baytarianReject: (id, reason) => withAdminStatsInvalidation(
    () => req(`/admin/baytarian-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  ),

  // bundles (course bundling)
  bundles: () => req('/admin/bundles'),
  bundleGet: (id) => req(`/admin/bundles/${id}`),
  bundleCreate: (body) => req('/admin/bundles', { method: 'POST', body: JSON.stringify(body) }),
  bundleUpdate: (id, body) => req(`/admin/bundles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  bundleDelete: (id) => req(`/admin/bundles/${id}`, { method: 'DELETE' }),

  // payments
  payments: (status) => req('/admin/payments' + (status ? `?status=${status}` : '')),
  approve: (id) => withAdminStatsInvalidation(
    () => req(`/admin/payments/${id}/approve`, { method: 'POST' }),
  ),
  reject: (id, reason) => withAdminStatsInvalidation(
    () => req(`/admin/payments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  ),

  // instapay accounts
  accounts: () => req('/admin/instapay-accounts'),
  accountCreate: (body) => req('/admin/instapay-accounts', { method: 'POST', body: JSON.stringify(body) }),
  accountUpdate: (id, body) => req(`/admin/instapay-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // site settings
  settingsGet: () => req('/admin/settings'),
  settingsPut: (body) => req('/admin/settings', { method: 'PUT', body: JSON.stringify(body) }),

  // articles (blog + free content)
  articlesAdmin: (params) => req('/admin/articles' + qs(params)),
  articleGet: (id) => req(`/admin/articles/${id}`),
  articleCreate: (body) => req('/admin/articles', { method: 'POST', body: JSON.stringify(body) }),
  articleUpdate: (id, body) => req(`/admin/articles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  articleDelete: (id) => req(`/admin/articles/${id}`, { method: 'DELETE' }),

  // contact messages
  messages: (params) => req('/admin/messages' + qs(params)),
  messageUpdate: (id, body) => req(`/admin/messages/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  messageDelete: (id) => req(`/admin/messages/${id}`, { method: 'DELETE' }),
};

// Receipt image needs the bearer token, so fetch as a blob and hand back an object URL.
export async function fetchReceipt(id) {
  const r = await fetch(`${BASE}/admin/payments/${id}/receipt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('receipt_failed');
  return URL.createObjectURL(await r.blob());
}

// Baytarian verification document (PDF/image) — auth-gated, returned as an object URL.
export async function fetchBaytarianDoc(rid, idx) {
  const r = await fetch(`${BASE}/admin/baytarian-requests/${rid}/doc/${idx}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error('doc_failed');
  return URL.createObjectURL(await r.blob());
}
