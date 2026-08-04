export const ADMIN_DATA_CHANGED_EVENT = 'baytara:admin-data-changed';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRANSIENT_ADMIN_MUTATIONS = [
  '/admin/vdocipher/test',
  '/admin/vdocipher/upload-credentials',
  '/preview',
];
const WORKFLOW_INTERNAL_MUTATIONS = [
  /^\/admin\/videos\/[^/]+\/courses(?:\/|$)/,
  /^\/admin\/courses\/[^/]+\/videos(?:\/|$)/,
];

export function shouldNotifyAdminDataChanged(path, method = 'GET') {
  const normalizedMethod = method.toUpperCase();
  if (!MUTATING_METHODS.has(normalizedMethod)) return false;
  if (!path.startsWith('/admin/')) return false;
  if (WORKFLOW_INTERNAL_MUTATIONS.some((pattern) => pattern.test(path))) return false;
  return !TRANSIENT_ADMIN_MUTATIONS.some((segment) => path.includes(segment));
}

export function notifyAdminDataChanged(detail = {}) {
  if (typeof window === 'undefined') return;
  const dispatch = () => {
    window.dispatchEvent(new CustomEvent(ADMIN_DATA_CHANGED_EVENT, { detail }));
  };
  if (typeof window.queueMicrotask === 'function') window.queueMicrotask(dispatch);
  else Promise.resolve().then(dispatch);
}
