// Baytara design tokens — ported verbatim from design-systems/baytara/Baytara Home.dc.html
// Single source of truth for colors, gradients, fonts, and layout constants.
// 2026-07 rebrand: red/orange persona → navy/gold (accent #12285a, gold #c9a227).

export const colors = {
  accent: '#12285a',
  accentSoft: '#eef2fb',
  ink: '#14142b',
  ink2: '#33334a',
  muted: '#6b6b7b',
  muted2: '#9a9aac',
  line: '#ececf2',
  line2: '#f0f0f4',
  surface: '#ffffff',
  surfaceAlt: '#f5f5f8',
  surfaceMuted: '#f7f7fb',
  star: '#f5b23e',
  gold: '#c9a227',
  utilityBar: '#0a1730',
  footer: '#0a1730',
};

// Dark hero / header gradients
export const gradients = {
  hero: 'linear-gradient(120deg, #0b1a3f 0%, #12285a 55%, #0d1f47 100%)',
  darkPanel: 'linear-gradient(120deg,#0b1a3f,#12285a)',
  accentCta: 'linear-gradient(135deg,#12285a,#c9a227)',
  avatar: 'linear-gradient(135deg,#12285a,#2a5aa0)',
};

// Card / thumbnail gradient palette (the design's `g[]` array)
export const thumbGradients = [
  'linear-gradient(150deg,#0d1f47,#12285a)',
  'linear-gradient(150deg,#0f2a4d,#12285a)',
  'linear-gradient(150deg,#12285a,#1a3566)',
  'linear-gradient(150deg,#1a3566,#8a6d1f)',
  'linear-gradient(150deg,#0d1f47,#0d1f47)',
  'linear-gradient(150deg,#0f2a4d,#1a3566)',
];

// Category tile background gradients.
// ponytail: keys kept as legacy color names (red/purple/…) so mock.js refs don't
// churn; values remapped to the navy/gold family from the rebranded design.
export const categoryGradients = {
  red: 'linear-gradient(135deg,#12285a,#c9a227)',
  purple: 'linear-gradient(135deg,#12285a,#2a5aa0)',
  teal: 'linear-gradient(135deg,#0d1f47,#2a5aa0)',
  amber: 'linear-gradient(135deg,#8a6d1f,#e8c766)',
  pink: 'linear-gradient(135deg,#1a3566,#c9a227)',
  blue: 'linear-gradient(135deg,#12285a,#4a7bc0)',
  green: 'linear-gradient(135deg,#0f2a4d,#1a3566)',
  violet: 'linear-gradient(135deg,#12285a,#1a3566)',
};

export const font = "'Tajawal', system-ui, sans-serif";

export const layout = {
  maxWidth: 1240,
  headerHeight: 70,
};
