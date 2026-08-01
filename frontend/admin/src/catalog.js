export const CATEGORY_KEYS = [
  'large-animals', 'equine', 'pet-animals', 'poultry',
  'fish-other-animal-sources', 'camel',
];

export const ACCESS_TYPES = ['free', 'vet_free', 'baytarian', 'general'];
export const VIDEO_VIEWS = ['grid', 'list', 'table'];

export const CATALOG_STATUSES = ['draft', 'published', 'unpublished'];

export function orderedCategories(categories = []) {
  const fixedOrder = new Map(CATEGORY_KEYS.map((slug, index) => [slug, index]));
  return [...categories].sort((a, b) => {
    const aOrder = fixedOrder.has(a.slug) ? fixedOrder.get(a.slug) : CATEGORY_KEYS.length;
    const bOrder = fixedOrder.has(b.slug) ? fixedOrder.get(b.slug) : CATEGORY_KEYS.length;
    return aOrder - bOrder || String(a.name_en || a.name).localeCompare(String(b.name_en || b.name));
  });
}

export function isFixedCategory(category) {
  return CATEGORY_KEYS.includes(category?.slug);
}

export function localizedCatalogValue(item, field, language) {
  if (language === 'en') return item?.[`${field}_en`] || item?.[field] || '';
  return item?.[field] || item?.[`${field}_en`] || '';
}

export function catalogErrorCodes(error) {
  if (Array.isArray(error?.data?.errors) && error.data.errors.length) return error.data.errors;
  return [error?.data?.error || error?.message || 'error'];
}

export function posterFor(video) {
  return video?.poster || '';
}

export function providerReady(video) {
  return String(video?.status || '').toLowerCase() === 'ready';
}

export function durationLabel(seconds, minutes) {
  const total = Number.isFinite(seconds) ? seconds : Number(minutes || 0) * 60;
  if (!total) return '';
  return Math.round(total / 60);
}
