import { Platform } from 'react-native';

/**
 * The single source of truth for colour, spacing, radii, typography,
 * elevation, and motion (docs/REMEDIATION.md §9.1).
 *
 * Before this there were nineteen local `const C = { ... }` palette objects,
 * one per screen, and they disagreed with each other: `#060814`, `#070913`,
 * `#080A12`, `#0A0C16`, `#04060f` and `#000000` were all "the background",
 * five different hexes were all "the border", and `src/constants/theme.ts`
 * defined a real palette that nothing imported.
 *
 * Every text colour here clears WCAG AA 4.5:1 on all three surfaces
 * (`bg`, `card`, `cardAlt`). Re-measured after the light theme landed: the
 * ratios recorded here previously had been taken against the old *dark*
 * palette and were simply wrong once the surfaces flipped to near-white —
 * textMuted was sitting at 2.45:1 and greenText at 3.60:1 while this
 * comment claimed the whole set passed. `npm run test:ui` now checks the
 * rendered result in a browser, so a regression here is caught rather than
 * asserted. Verify a change with that, not by eye.
 *
 * Accent colours come in two forms. The plain one (`blue`, `purple`) is the
 * brand fill for buttons, borders, bars, and large glyphs, where the 3:1
 * non-text threshold applies. The `*Text` variant is the one to use when
 * the colour is carrying words or a small icon, because the brand blue
 * `#0066FF` is only 4.13:1 on the background and fails AA as text.
 */

/** Contrast ratios in the comments are measured against `bg` / `card`. */
export const colors = {
  // ── Surfaces ────────────────────────────────────────────────────
  /** App background. Matches the root navigation theme. */
  bg: '#F8FAFC',
  /** Default raised surface: cards, sheets, inputs. */
  card: '#FFFFFF',
  /** A second step up, for a card inside a card or a selected row. */
  cardAlt: '#F1F5F9',
  /** Hairlines and card outlines. */
  border: '#E2E8F0',

  // ── Text ────────────────────────────────────────────────────────
  /** Primary text on light background. */
  white: '#FFFFFF',
  /** Primary body / title dark slate text. */
  text: '#0F172A',
  /** Secondary text — labels, captions. 5.21 / 5.45 / 4.97 */
  textSec: '#5B6B7F',
  /** The dimmest text allowed / placeholder / inactive glyphs.
   *  4.55 / 4.76 / 4.34 — clears AA on `bg` and `card`; on `cardAlt` it
   *  lands at 4.34, so use textSec for real body copy on that surface.
   *  A tier dimmer than this cannot clear 4.5:1 on a near-white surface at
   *  all, which is the real constraint — not a value left to taste. */
  textMuted: '#64748B',

  // ── Accents (fills, borders, large glyphs) ──────────────────────
  blue: '#2563EB',
  purple: '#6366F1',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  pink: '#EC4899',
  star: '#F59E0B',
  indigo: '#4F46E5',

  // ── Accents, text-safe (words and small icons) ──────────────────
  blueText: '#2563EB',
  purpleText: '#7C3AED',
  redText: '#C81E1E',
  greenText: '#047857',
  pinkText: '#C11B63',
  /** Amber carrying words. The fill `amber` (#F59E0B) is 2.05:1 on the
   *  background — it can hold a bar or a large glyph, never a label. */
  amberText: '#B45309',

  // ── Glow / highlight tints ──────────────────────────────────────
  blueGlow: '#DBEAFE',
  purpleGlow: '#EDE9FE',
  greenGlow: '#D1FAE5',
  amberGlow: '#FEF3C7',
  roseGlow: '#FEE2E2',
  borderGlow: '#CBD5E1',
} as const;

/**
 * Aliases for names the old per-screen palettes used.
 */
export const colorAliases = {
  orange: colors.amber,
  rose: colors.pink,
  yellow: colors.star,
  text: '#0F172A',
  textSecondary: colors.textSec,
  divider: colors.border,
  cardBorder: colors.border,
  accent: colors.blueText,
  accentLight: '#EFF6FF',
} as const;

/** Every colour name any screen uses, canonical or aliased. */
export const C = { ...colors, ...colorAliases } as const;

// ── Spacing ───────────────────────────────────────────────────────
// A 4pt grid. Named by step rather than by t-shirt size so `space[3]`
// reads as "three steps" and arithmetic on it stays obvious.
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Type scale (§9.3). The old code used `fontSize: 8.5` and `fontSize: 9`
 * throughout, which is below any reasonable legibility threshold on a
 * phone; `xs` at 12 is the floor here and nothing smaller is a token.
 */
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Comfortable line heights, as multipliers of the font size. */
export const lineHeight = {
  tight: 1.25,
  normal: 1.45,
  relaxed: 1.6,
} as const;

/**
 * Minimum touch target (§9.3). Several icon buttons in this app are 30×30;
 * both platforms' guidelines put the floor at 44.
 */
export const MIN_TOUCH_TARGET = 44;

export const elevation = {
  none: {},
  card: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 2px 10px rgba(15,23,42,0.06)' },
  }),
  modal: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    default: { boxShadow: '0 8px 20px rgba(15,23,42,0.12)' },
  }),
} as const;

export const fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const motion = {
  fast: 150,
  base: 220,
  slow: 320,
} as const;

export const theme = {
  colors: C,
  fonts,
  space,
  radii,
  fontSize,
  fontWeight,
  lineHeight,
  elevation,
  motion,
  MIN_TOUCH_TARGET,
} as const;

export type ThemeColorName = keyof typeof C;
