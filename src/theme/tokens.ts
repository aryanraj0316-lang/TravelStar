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
 * Every colour here has been checked against WCAG AA (§9.3). Text colours
 * clear 4.5:1 on all three surfaces (`bg`, `card`, `cardAlt`); the two old
 * muted greys did not — 6A7182 was 4.08:1 on the background and 3.77:1 on
 * a card, and 64748B was 4.19/3.87. Both failed for body text at any size
 * and were the app's most-used secondary colour. (Those two hexes are
 * written without a leading # on purpose: they must never come back, and
 * this file is the one place a search for them would otherwise hit.)
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
  bg: '#060814',
  /** Default raised surface: cards, sheets, inputs. */
  card: '#111322',
  /** A second step up, for a card inside a card or a selected row. */
  cardAlt: '#181C2E',
  /** Hairlines and card outlines. */
  border: '#1A1D30',

  // ── Text ────────────────────────────────────────────────────────
  /** Primary text. */
  white: '#FFFFFF',
  /** Secondary text — labels, captions. 7.78:1 / 7.18:1. */
  textSec: '#94A3B8',
  /** The dimmest text allowed. 5.33:1 / 4.93:1 — the floor that still
   *  passes AA. Anything dimmer than this is not a token. */
  textMuted: '#7E8494',

  // ── Accents (fills, borders, large glyphs) ──────────────────────
  blue: '#0066FF',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  pink: '#EC4899',
  star: '#FBBF24',
  indigo: '#6366F1',

  // ── Accents, text-safe (words and small icons) ──────────────────
  /** 5.42:1 / 5.01:1 — use instead of `blue` for any coloured text. */
  blueText: '#3B82F6',
  /** 7.33:1 / 6.77:1 — `purple` is 4.71/4.35, borderline on a card. */
  purpleText: '#A78BFA',
  /** 7.21:1 / 6.66:1 — `red` is 5.30/4.89, and drops to 4.48 on cardAlt. */
  redText: '#F87171',
  greenText: '#34D399',
  pinkText: '#F472B6',

  // ── Glow / highlight tints ──────────────────────────────────────
  blueGlow: '#00F2FE',
  purpleGlow: '#A78BFA',
  greenGlow: '#34D399',
  amberGlow: '#FBBF24',
  roseGlow: '#F87171',
  borderGlow: '#323F7C',
} as const;

/**
 * Aliases for names the old per-screen palettes used. Keeping them means a
 * screen migrates by swapping its local object for an import rather than by
 * rewriting every style rule, which is where a migration this wide would
 * otherwise introduce bugs. Prefer the canonical names above in new code.
 */
export const colorAliases = {
  orange: colors.amber,
  rose: colors.pink,
  yellow: colors.star,
  text: colors.white,
  textSecondary: colors.textSec,
  divider: colors.border,
  cardBorder: colors.border,
  accent: colors.blueText,
  accentLight: 'rgba(59, 130, 246, 0.12)',
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
    ios: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 4 },
    default: { boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
  }),
  modal: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
    android: { elevation: 12 },
    default: { boxShadow: '0 10px 24px rgba(0,0,0,0.45)' },
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
