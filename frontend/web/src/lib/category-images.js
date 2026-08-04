export const categoryImages = {
  'large-animals': '/images/categories/large-animals.webp',
  equine: '/images/categories/equine.webp',
  'pet-animals': '/images/categories/pet-animals.webp',
  poultry: '/images/categories/poultry.webp',
  'fish-other-animal-sources': '/images/categories/fish-other-animal-sources.webp',
  camel: '/images/categories/camel.webp',
};

export function categoryImage(slug) {
  return categoryImages[slug] || '';
}
