/**
 * @fileoverview Theme system for Threadsmiitit.
 *
 * Two independent axes:
 *   - VIBE: typography + shape personality
 *   - PALETTE: colour world
 *
 * Call {@link makeTheme} to merge them into a flat token object.
 * Components that draw content surfaces (cards, sheets, chat) use the
 * `t.card` sub-theme, which is always light even when the chrome is dark.
 *
 * Recommended production default: social + monodark.
 */

/** @type {Record<string, object>} */
export const VIBES = {
  social: {
    label: 'Playful & social',
    fontHead: '"Poppins", system-ui, sans-serif',
    fontBody: '"Poppins", system-ui, sans-serif',
    headWeight: 700,
    headSpacing: '-0.01em',
    headTransform: 'none',
    radius: 22,
    radiusSm: 14,
    radiusPill: 999,
    cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.12)',
  },
  editorial: {
    label: 'Clean & modern',
    fontHead: '"Fraunces", Georgia, serif',
    fontBody: '"Inter Tight", system-ui, sans-serif',
    headWeight: 600,
    headSpacing: '-0.015em',
    headTransform: 'none',
    radius: 10,
    radiusSm: 7,
    radiusPill: 999,
    cardShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  bold: {
    label: 'Bold & expressive',
    fontHead: '"Archivo", system-ui, sans-serif',
    fontBody: '"Archivo", system-ui, sans-serif',
    headWeight: 800,
    headSpacing: '-0.02em',
    headTransform: 'uppercase',
    radius: 6,
    radiusSm: 4,
    radiusPill: 6,
    cardShadow: '0 2px 0 rgba(0,0,0,0.9)',
  },
  cozy: {
    label: 'Cozy & warm',
    fontHead: '"Quicksand", system-ui, sans-serif',
    fontBody: '"Nunito", system-ui, sans-serif',
    headWeight: 700,
    headSpacing: '0em',
    headTransform: 'none',
    radius: 26,
    radiusSm: 18,
    radiusPill: 999,
    cardShadow: '0 2px 4px rgba(120,90,60,0.06), 0 14px 30px -16px rgba(120,90,60,0.22)',
  },
};

/** @type {Record<string, object>} */
export const PALETTES = {
  monodark: {
    label: 'Threads mono (tumma)',
    dark: true,
    bg: '#0a0a0a',
    surface: '#181818',
    surfaceAlt: '#222222',
    ink: '#f5f5f5',
    inkSoft: '#9a9a9a',
    line: 'rgba(255,255,255,0.12)',
    brand: '#f5f5f5',
    brandInk: '#0a0a0a',
    chip: '#262626',
    glow: '#ffffff',
    glowInk: '#0a0a0a',
    navActive: '#f5f5f5',
    cardBg: '#ffffff',
    cardInk: '#0a0a0a',
    cardInkSoft: '#6b6b6b',
    cardLine: 'rgba(0,0,0,0.10)',
    cardAlt: '#f5f5f5',
  },
  mono: {
    label: 'Threads mono (vaalea)',
    bg: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f5f5f5',
    ink: '#0a0a0a',
    inkSoft: '#6b6b6b',
    line: 'rgba(0,0,0,0.10)',
    brand: '#0a0a0a',
    brandInk: '#ffffff',
    chip: '#f0f0f0',
    glow: '#0a0a0a',
    glowInk: '#ffffff',
    navActive: '#0a0a0a',
  },
  warm: {
    label: 'Warm coral',
    bg: '#fbf7f2',
    surface: '#ffffff',
    surfaceAlt: '#f5ede4',
    ink: '#2a2018',
    inkSoft: '#8a7a68',
    line: 'rgba(120,90,60,0.14)',
    brand: '#e0613f',
    brandInk: '#ffffff',
    chip: '#f4e9df',
    glow: '#e0613f',
    glowInk: '#ffffff',
    navActive: '#e0613f',
  },
  fresh: {
    label: 'Fresh green',
    bg: '#f3f7f4',
    surface: '#ffffff',
    surfaceAlt: '#e6efe9',
    ink: '#142019',
    inkSoft: '#5f7268',
    line: 'rgba(20,60,40,0.12)',
    brand: '#1f8a5b',
    brandInk: '#ffffff',
    chip: '#e2efe7',
    glow: '#1f8a5b',
    glowInk: '#ffffff',
    navActive: '#1f8a5b',
  },
  dusk: {
    label: 'Dusk purple',
    bg: '#f6f4fb',
    surface: '#ffffff',
    surfaceAlt: '#ece7f6',
    ink: '#1d1830',
    inkSoft: '#6d6488',
    line: 'rgba(60,40,100,0.12)',
    brand: '#6b4fd6',
    brandInk: '#ffffff',
    chip: '#ebe5f9',
    glow: '#6b4fd6',
    glowInk: '#ffffff',
    navActive: '#6b4fd6',
  },
};

/**
 * Merges a vibe and palette into a flat theme token object.
 *
 * The returned object includes a `card` sub-theme for content surfaces
 * (meetup cards, detail sheets, chat pane). On dark palettes the card
 * sub-theme uses light colours for readability.
 *
 * @param {string} vibeKey - Key of the desired vibe (e.g. 'social').
 * @param {string} palKey  - Key of the desired palette (e.g. 'monodark').
 * @returns {object} Flat theme token object with a nested `card` sub-theme.
 */
export function makeTheme(vibeKey, palKey) {
  const v = VIBES[vibeKey] ?? VIBES.social;
  const p = PALETTES[palKey] ?? PALETTES.monodark;
  const t = { ...v, ...p, vibeKey, palKey };

  const hasLightCards = !!p.cardBg;
  t.card = {
    ...t,
    dark: hasLightCards ? false : p.dark,
    bg: p.cardBg ?? t.surface,
    surface: p.cardBg ?? t.surface,
    surfaceAlt: p.cardAlt ?? t.surfaceAlt,
    ink: p.cardInk ?? t.ink,
    inkSoft: p.cardInkSoft ?? t.inkSoft,
    line: p.cardLine ?? t.line,
    brand: hasLightCards ? (p.cardBrand ?? '#0a0a0a') : t.brand,
    brandInk: hasLightCards ? '#ffffff' : t.brandInk,
    glow: hasLightCards ? (p.cardBrand ?? '#0a0a0a') : t.glow,
  };

  return t;
}
