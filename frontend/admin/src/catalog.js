export const CATEGORY_KEYS = [
  'large-animals', 'equine', 'pet-animals', 'poultry',
  'fish-other-animal-sources', 'camel',
];

export const ACCESS_TYPES = ['free', 'vet_free', 'baytarian', 'general'];
export const VIDEO_VIEWS = ['grid', 'list', 'table'];

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
