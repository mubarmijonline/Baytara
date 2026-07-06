// Baytara design tokens — ported verbatim from design-systems/baytara/Baytara Home.dc.html
// Single source of truth for colors, gradients, fonts, and layout constants.

export const colors = {
  accent: '#e11b22',
  accentSoft: '#fff0f0',
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
  utilityBar: '#0e0e1e',
  footer: '#0e0e1e',
};

// Dark hero / header gradients
export const gradients = {
  hero: 'linear-gradient(120deg, #14142b 0%, #21213f 55%, #2d1730 100%)',
  darkPanel: 'linear-gradient(120deg,#14142b,#2a1a3a)',
  accentCta: 'linear-gradient(120deg, #e11b22, #ff6b3d)',
  avatar: 'linear-gradient(135deg,#5b3cc4,#8a5cff)',
};

// Card / thumbnail gradient palette (the design's `g[]` array)
export const thumbGradients = [
  'linear-gradient(150deg,#2a2350,#5b3cc4)',
  'linear-gradient(150deg,#3a1030,#d6216f)',
  'linear-gradient(150deg,#102a3a,#0f8b8d)',
  'linear-gradient(150deg,#3a2410,#e8890c)',
  'linear-gradient(150deg,#2a1030,#7a2ff2)',
  'linear-gradient(150deg,#102a1e,#1a9e5a)',
];

// Category tile background gradients
export const categoryGradients = {
  red: 'linear-gradient(135deg,#e11b22,#ff6b3d)',
  purple: 'linear-gradient(135deg,#5b3cc4,#8a5cff)',
  teal: 'linear-gradient(135deg,#0f8b8d,#2fd4c9)',
  amber: 'linear-gradient(135deg,#e8890c,#ffc44d)',
  pink: 'linear-gradient(135deg,#d6216f,#ff6ba8)',
  blue: 'linear-gradient(135deg,#2456c6,#5b9bff)',
  green: 'linear-gradient(135deg,#1a9e5a,#54d68a)',
  violet: 'linear-gradient(135deg,#7a2ff2,#c06bff)',
};

export const font = "'Tajawal', system-ui, sans-serif";

export const layout = {
  maxWidth: 1240,
  headerHeight: 70,
};
