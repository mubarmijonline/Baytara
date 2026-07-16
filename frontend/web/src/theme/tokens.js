// Baytara design tokens — ported from the updated Claude Design (brand-identity revision).
// Brand guide: Space Explorer blue (#2a459a family, design accent #3048A0), Gamboge gold
// (#ead559 family, design accent #E9BE43). Fonts: Thmanyah (AR) + Stolzl (EN), served locally.

export const colors = {
  accent: '#3048A0',
  accentSoft: '#eef2fb',
  ink: '#1E2A5E',
  ink2: '#33334a',
  muted: '#6b6b7b',
  muted2: '#9a9aac',
  line: '#ececf2',
  line2: '#f0f0f4',
  surface: '#ffffff',
  surfaceAlt: '#f5f5f8',
  surfaceMuted: '#f7f7fb',
  star: '#f5b23e',
  gold: '#E9BE43',
  utilityBar: '#141E42',
  footer: '#141E42',
};

// Dark hero / header gradients
export const gradients = {
  hero: 'linear-gradient(120deg, #1B2A66 0%, #3048A0 55%, #16255C 100%)',
  darkPanel: 'linear-gradient(120deg,#1B2A66,#3048A0)',
  accentCta: 'linear-gradient(135deg,#3048A0,#E9BE43)',
  avatar: 'linear-gradient(135deg,#3048A0,#4356A6)',
};

// Card / thumbnail gradient palette (the design's `g[]` array)
export const thumbGradients = [
  'linear-gradient(150deg,#16255C,#3048A0)',
  'linear-gradient(150deg,#16255C,#3048A0)',
  'linear-gradient(150deg,#3048A0,#24357A)',
  'linear-gradient(150deg,#24357A,#8a6d1f)',
  'linear-gradient(150deg,#16255C,#16255C)',
  'linear-gradient(150deg,#16255C,#24357A)',
];

// Category tile background gradients.
// ponytail: keys kept as legacy color names so consumers don't churn; values are the
// blue/gold family from the updated design.
export const categoryGradients = {
  red: 'linear-gradient(135deg,#3048A0,#E9BE43)',
  purple: 'linear-gradient(135deg,#3048A0,#4356A6)',
  teal: 'linear-gradient(135deg,#16255C,#4356A6)',
  amber: 'linear-gradient(135deg,#8a6d1f,#F5D877)',
  pink: 'linear-gradient(135deg,#24357A,#E9BE43)',
  blue: 'linear-gradient(135deg,#3048A0,#5A6FC0)',
  green: 'linear-gradient(135deg,#16255C,#24357A)',
  violet: 'linear-gradient(150deg,#24357A,#8a6d1f)',
};

export const font = "'Thmanyah', 'Stolzl', system-ui, sans-serif";

export const layout = {
  maxWidth: 1240,
  headerHeight: 70,
};
