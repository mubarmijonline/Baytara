export const ADMIN_STATS_CHANGED_EVENT = 'baytara:admin-stats-changed';

export function notifyAdminStatsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_STATS_CHANGED_EVENT));
  }
}

export async function withAdminStatsInvalidation(mutation) {
  const result = await mutation();
  notifyAdminStatsChanged();
  return result;
}
