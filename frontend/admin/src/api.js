import { withAdminStatsInvalidation } from './admin-stats.js';
import { notifyAdminDataChanged, shouldNotifyAdminDataChanged } from './admin-data-events.js';

const BASE = '/api/v1';
let token = localStorage.getItem('baytara_admin_token') || '';
let refreshToken = localStorage.getItem('baytara_admin_refresh') || '';

export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('baytara_admin_token', t);
  else localStorage.removeItem('baytara_admin_token');
}
export function setRefreshToken(t) {
  refreshToken = t || '';
  if (t) localStorage.setItem('baytara_admin_refresh', t);
  else localStorage.removeItem('baytara_admin_refresh');
}
export function clearSession() { setToken(''); setRefreshToken(''); }

// The access token lasts fifteen minutes, and nothing renewed it: an admin working
// through the queue was signed out between one request and the next. The API has
// always issued a thirty-day refresh token, so the session is renewed rather than
// dropped. One refresh at a time, or simultaneous expiries race each other.
let refreshing = null;
async function renewAccessToken() {
  if (!refreshToken) return '';
  if (!refreshing) {
    refreshing = fetch(BASE + '/auth/refresh', {
      method: 'POST', headers: { Authorization: `Bearer ${refreshToken}` },
    }).then(async (r) => {
      if (!r.ok) { clearSession(); return ''; }
      const body = await r.json();
      if (body.access_token) setToken(body.access_token);
      if (body.refresh_token) setRefreshToken(body.refresh_token);
      return body.access_token || '';
    }).catch(() => '').finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function req(path, opts = {}, retried = false) {
  const { clearTokenOn401 = true, skipAdminDataChanged = false, ...fetchOptions } = opts;
  const r = await fetch(BASE + path, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  // An expired access token renews itself and the call is replayed once. Only a
  // refresh that fails means signing in again.
  if (r.status === 401 && !retried && refreshToken) {
    if (await renewAccessToken()) return req(path, opts, true);
  }
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const data = isJson ? await r.json() : null;
  if (r.status === 401) {
    if (clearTokenOn401) clearSession();
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || 'error'), { status: r.status, data });
  if (!skipAdminDataChanged && shouldNotifyAdminDataChanged(path, fetchOptions.method || 'GET')) {
    notifyAdminDataChanged({ path, method: (fetchOptions.method || 'GET').toUpperCase() });
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};

async function blobReq(path, retried = false) {
  const response = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401 && !retried && refreshToken) {
    if (await renewAccessToken()) return blobReq(path, true);
  }
  if (response.status === 401) {
    clearSession();
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  if (!response.ok) throw Object.assign(new Error('download_failed'), { status: response.status });
  return response.blob();
}

export const api = {
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req('/auth/me'),

  stats: ({ deferUnauthorized = false } = {}) => req('/admin/stats', { clearTokenOn401: !deferUnauthorized }),
  // Disk taken by self-hosted video. Its own call: it walks the filesystem, and the
  // dashboard counters should not wait on that.
  storage: () => req('/admin/storage'),

  // users
  users: (params) => req('/admin/users' + qs(params)),
  deviceSwapRequests: (status = 'pending') => req(`/admin/device-swap-requests?status=${status}`),
  deviceSwapDecide: (id, decision) => req(`/admin/device-swap-requests/${id}/${decision}`, { method: 'POST' }),
  promos: () => req('/admin/promo-codes'),
  promoCreate: (body) => req('/admin/promo-codes', { method: 'POST', body: JSON.stringify(body) }),
  promoUpdate: (id, body) => req(`/admin/promo-codes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  promoDelete: (id) => req(`/admin/promo-codes/${id}`, { method: 'DELETE' }),
  userCreate: (body) => req('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  userUpdate: (id, body) => req(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  userDelete: (id) => req(`/admin/users/${id}`, { method: 'DELETE' }),

  // image upload (instructor photo, course cover) -> { url }
  books: () => req('/admin/books'),
  bookCreate: (body) => req('/admin/books', { method: 'POST', body: JSON.stringify(body) }),
  bookUpdate: (id, body) => req(`/admin/books/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  bookDelete: (id) => req(`/admin/books/${id}`, { method: 'DELETE' }),
  bookPdf: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(BASE + `/admin/books/${id}/pdf`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async (r) => {
      const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
      if (!r.ok) throw Object.assign(new Error((data && data.error) || 'error'), { status: r.status, data });
      return data;
    });
  },
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(BASE + '/admin/uploads/image', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async (r) => {
      const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
      if (!r.ok) throw Object.assign(new Error((data && data.error) || 'error'), { status: r.status, data });
      return data;
    });
  },

  // self-hosted video: upload a file to our own server (packaged as encrypted HLS)
  videoUpload: (id, file, onProgress) => new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + `/admin/videos/${id}/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(Object.assign(new Error((data && data.error) || 'error'), { status: xhr.status, data }));
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(fd);
  }),
  videoUploadDelete: (id) => req(`/admin/videos/${id}/upload`, { method: 'DELETE' }),

  // categories
  categories: () => req('/categories'),
  categoryCreate: (body) => req('/admin/categories', { method: 'POST', body: JSON.stringify(body) }),
  categoryUpdate: (id, body) => req(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  categoryDelete: (id) => req(`/admin/categories/${id}`, { method: 'DELETE' }),

  // courses
  courses: (params) => req('/admin/courses' + qs(params)),
  enrollments: (params) => req('/admin/enrollments' + qs(params)),
  enrollmentCancel: (id, body) => req(`/admin/enrollments/${id}/cancel`, { method: 'POST', body: JSON.stringify(body) }),
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
  courseExam: (cid) => req(`/admin/courses/${cid}/exam`),
  courseExamSave: (cid, body) => req(`/admin/courses/${cid}/exam`, { method: 'PUT', body: JSON.stringify(body) }),
  examQuestionCreate: (cid, body) => req(`/admin/courses/${cid}/exam/questions`, { method: 'POST', body: JSON.stringify(body) }),
  examQuestionUpdate: (qid, body) => req(`/admin/exam-questions/${qid}`, { method: 'PATCH', body: JSON.stringify(body) }),
  examQuestionDelete: (qid) => req(`/admin/exam-questions/${qid}`, { method: 'DELETE' }),
  catalogVideos: (params) => req('/admin/videos' + qs(params)),
  videoLibrary: (params, { signal } = {}) => req('/admin/video-library' + qs(params), { signal }),
  video: (id) => req(`/admin/videos/${id}`),
  // `silent` keeps the global data-changed event from firing. The upload page needs it:
  // that event remounts the active page, which would throw away a transfer in progress.
  videoCreate: (body, { silent = false } = {}) => req('/admin/videos', {
    method: 'POST', body: JSON.stringify(body), skipAdminDataChanged: silent,
  }),
  videoUpdate: (id, body) => req(`/admin/videos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  videoDelete: (id) => req(`/admin/videos/${id}`, { method: 'DELETE' }),
  // The few videos shown first on the home page strip and in the public library, in order.
  pinnedVideos: () => req('/admin/videos/pinned'),
  pinnedVideosSet: (video_ids) => req('/admin/videos/pinned', { method: 'PUT', body: JSON.stringify({ video_ids }) }),
  videoCoursesSet: (id, course_ids) => req(`/admin/videos/${id}/courses`, { method: 'POST', body: JSON.stringify({ course_ids }) }),
  videoCoursesAdd: (id, course_ids) => req(`/admin/videos/${id}/courses/add`, { method: 'POST', body: JSON.stringify({ course_ids }) }),
  videoCourseRemove: (id, courseId) => req(`/admin/videos/${id}/courses/${courseId}`, { method: 'DELETE' }),
  courseVideoOrder: (courseId, video_ids) => req(`/admin/courses/${courseId}/videos/order`, { method: 'PUT', body: JSON.stringify({ video_ids }) }),
  videosReorder: (courseId, order) => req(`/admin/courses/${courseId}/videos/reorder`, { method: 'POST', body: JSON.stringify({ order }) }),
  vdocipherTest: () => req('/admin/vdocipher/test', { method: 'POST' }),
  vdocipherSyncFolders: (body) => req('/admin/vdocipher/sync-folders', { method: 'POST', body: JSON.stringify(body || {}) }),
  vdocipherVideos: (params) => req('/admin/vdocipher/videos' + qs(params)),
  vdocipherVideo: (id) => req(`/admin/vdocipher/videos/${id}`),
  vdocipherVideoUpdate: (id, body, options = {}) => req(`/admin/vdocipher/videos/${id}`, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  vdocipherPreview: (id) => req(`/admin/vdocipher/videos/${id}/preview`, { method: 'POST' }),
  vdocipherFolder: (id, params) => req(`/admin/vdocipher/folders/${id}` + qs(params)),
  vdocipherFolderCreate: (body) => req('/admin/vdocipher/folders', { method: 'POST', body: JSON.stringify(body) }),
  vdocipherFolderRename: (id, body) => req(`/admin/vdocipher/folders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  vdocipherFolderDelete: (id) => req(`/admin/vdocipher/folders/${id}`, { method: 'DELETE' }),
  vdocipherMove: (body) => req('/admin/vdocipher/move', { method: 'POST', body: JSON.stringify(body) }),
  vdocipherUploadCredentials: (body) => req('/admin/vdocipher/upload-credentials', { method: 'POST', body: JSON.stringify(body) }),
  vdocipherImport: (body, options = {}) => req('/admin/vdocipher/import', { method: 'POST', body: JSON.stringify(body), ...options }),

  // Baytara-owned playback security and viewing reports
  videoReportSummary: (params) => req('/admin/video-reports/summary' + qs(params)),
  videoReportSessions: (params) => req('/admin/video-reports/sessions' + qs(params)),
  videoReportSession: (id) => req(`/admin/video-reports/sessions/${id}`),
  downloadVideoReport: (params) => blobReq('/admin/video-reports/export.csv' + qs(params)),

  // baytarian verification requests
  baytarianRequests: (status) => req('/admin/baytarian-requests' + (status ? `?status=${status}` : '')),
  // No kind to pass: there is one verified status, and the server keeps whatever the
  // request already read as the record of which document it was.
  baytarianApprove: (id) => withAdminStatsInvalidation(
    () => req(`/admin/baytarian-requests/${id}/approve`, { method: 'POST' }),
  ),
  baytarianReject: (id, reason) => withAdminStatsInvalidation(
    () => req(`/admin/baytarian-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  ),
  // Undo an approval — the answer to a machine having made the decision.
  baytarianRevoke: (id, reason) => withAdminStatsInvalidation(
    () => req(`/admin/baytarian-requests/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  ),
  // Verify an account with no document, on the admin's own authority. Lands in the
  // same queue on the `admin` route, so it is visible and revocable like the rest.
  verifyUserDirectly: (userId, grant, note) => withAdminStatsInvalidation(
    () => req(`/admin/users/${userId}/verify`, { method: 'POST', body: JSON.stringify({ grant, note }) }),
  ),

  // bundles (course bundling)
  bundles: () => req('/admin/bundles'),
  bundleGet: (id) => req(`/admin/bundles/${id}`),
  bundleCreate: (body) => req('/admin/bundles', { method: 'POST', body: JSON.stringify(body) }),
  bundleUpdate: (id, body) => req(`/admin/bundles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  bundleDelete: (id) => req(`/admin/bundles/${id}`, { method: 'DELETE' }),

  // course units: which unit a video sits in is per-course, so it keys off the course
  courseVideoModule: (courseId, videoId, module_id) => req(
    `/admin/courses/${courseId}/videos/${videoId}/module`,
    { method: 'PUT', body: JSON.stringify({ module_id }) },
  ),

  // course reviews (moderation is publish-then-hide)
  reviews: (params) => req('/admin/reviews' + qs(params)),
  reviewUpdate: (id, body) => req(`/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  reviewDelete: (id) => req(`/admin/reviews/${id}`, { method: 'DELETE' }),

  // learning paths (ordered course shelves shown as «مسارات» on the home page)
  paths: () => req('/admin/paths'),
  pathGet: (id) => req(`/admin/paths/${id}`),
  pathCreate: (body) => req('/admin/paths', { method: 'POST', body: JSON.stringify(body) }),
  pathUpdate: (id, body) => req(`/admin/paths/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  pathDelete: (id) => req(`/admin/paths/${id}`, { method: 'DELETE' }),

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
export async function fetchBaytarianDoc(rid, idx, retried = false) {
  const r = await fetch(`${BASE}/admin/baytarian-requests/${rid}/doc/${idx}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (r.status === 401 && !retried && refreshToken) {
    if (await renewAccessToken()) return fetchBaytarianDoc(rid, idx, true);
  }
  if (!r.ok) throw new Error('doc_failed');
  return URL.createObjectURL(await r.blob());
}
