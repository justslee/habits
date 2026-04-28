import { Platform } from 'react-native';

// --- Colors: Ink theme — cool deep blue-violet with violet accent ---
// Mirrors `[data-theme="ink"]` from the design canvas (oklch L C h, h=280).
export const colors = {
  // Backgrounds — deep ink
  bg: '#0F0F18',
  bg2: '#15161F',           // sheet/secondary panels (≈ oklch 0.17 0.008 280)
  card: '#1B1C28',          // surface
  cardElevated: '#23243A',
  input: '#15161F',
  surface2: '#1F2030',

  // Text — cool off-white
  text: '#EFEFF5',
  textSecondary: '#B8B8CB',
  textTertiary: '#6F708A',

  // Accent — violet on ink (oklch 0.78 0.14 280) — matches `[data-theme="ink"]` from styles.css.
  // Amber/ember is reserved for the NSBrandHeader cosmic gradient and the App Logo's north star.
  accent: '#9B8AE8',        // violet
  accent2: '#D89AD9',       // pink-violet (accent-2 oklch 0.82 0.12 320)
  accentLight: '#B7A8EF',   // softer violet for hover states
  accentSecondary: '#D89AD9',
  accentMuted: 'rgba(155,138,232,0.14)',
  accentGlow: 'rgba(155,138,232,0.3)',
  // Amber accents — used only by NSBrandHeader, App Logo, and "north star" decorations
  amber: '#E0B775',
  amberSoft: 'rgba(224,183,117,0.4)',

  // Semantic
  success: '#76C99C',
  warning: '#D2C56F',
  error: '#E27A6E',
  info: '#7AB0E8',
  good: '#76C99C',          // alias for design parity (canvas calls success "good")
  warn: '#D2C56F',          // alias for design parity
  recoveryGreen: '#7DD3A4', // Whoop recovery (≈ oklch 0.78 0.16 150)
  prGold: '#D9C56F',        // PR badges (≈ oklch 0.78 0.13 90)

  // Pillar colors — load-bearing, unchanged
  pillarQuant: '#8B5CF6',
  pillarMacro: '#06B6D4',
  pillarML: '#F97316',
  pillarAI: '#22D3EE',
  pillarSpeaking: '#EC4899',

  // Borders
  border: 'rgba(165,160,200,0.08)',
  borderFocus: 'rgba(155,138,232,0.35)',
  line: '#272838',

  // Chart — violet curve on ink
  chartLine: '#9B8AE8',
  chartFill: 'rgba(155,138,232,0.1)',
};

/** Pillar colors by DB id (1-5). */
export const PILLAR_COLORS: Record<number, string> = {
  1: colors.pillarQuant,
  2: colors.pillarMacro,
  3: colors.pillarML,
  4: colors.pillarAI,
  5: colors.pillarSpeaking,
};

/** Pillar colors by full name (for when backend returns name strings). */
export const PILLAR_COLORS_BY_NAME: Record<string, string> = {
  'Quantitative Finance': colors.pillarQuant,
  'Macro & Qualitative Investing': colors.pillarMacro,
  'Machine Learning (Math)': colors.pillarML,
  'AI Engineering & Deployment': colors.pillarAI,
  'Public Speaking & Communication': colors.pillarSpeaking,
};

// --- Spacing: 8px grid ---
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// --- Typography ---
// Inter for body, Instrument Serif Italic for editorial titles, JetBrains Mono for numerics.
const regular = 'Inter_400Regular';
const medium = 'Inter_500Medium';
const semibold = 'Inter_600SemiBold';
const bold = 'Inter_700Bold';
const serifItalic = 'InstrumentSerif_400Regular_Italic';
const mono = 'JetBrainsMono_400Regular';
const monoMedium = 'JetBrainsMono_500Medium';

export const fonts = {
  regular,
  medium,
  semibold,
  bold,
  serifItalic,
  mono,
  monoMedium,
};

export const typography = {
  display: { fontSize: 48, fontFamily: bold, letterSpacing: -1.5 },
  title1: { fontSize: 28, fontFamily: bold, letterSpacing: -0.5 },
  title2: { fontSize: 22, fontFamily: semibold, letterSpacing: -0.3 },
  title3: { fontSize: 18, fontFamily: semibold, letterSpacing: 0 },
  body: { fontSize: 15, fontFamily: regular, letterSpacing: 0 },
  bodyBold: { fontSize: 15, fontFamily: semibold, letterSpacing: 0 },
  caption: { fontSize: 13, fontFamily: medium, letterSpacing: 0.2 },
  micro: { fontSize: 11, fontFamily: semibold, letterSpacing: 0.5 },

  // Editorial italic — section titles, mantras
  serifTitle: { fontFamily: serifItalic, fontSize: 22, letterSpacing: -0.5, color: colors.text },
  serifLarge: { fontFamily: serifItalic, fontSize: 28, letterSpacing: -0.7, color: colors.text },
  serifHero:  { fontFamily: serifItalic, fontSize: 36, letterSpacing: -0.9, color: colors.text },

  // Numerics — mono, tabular
  monoNumber: { fontFamily: mono, fontSize: 22, letterSpacing: -0.5, color: colors.text },
  monoLarge:  { fontFamily: monoMedium, fontSize: 56, letterSpacing: -2, color: colors.text },
  monoHuge:   { fontFamily: monoMedium, fontSize: 88, letterSpacing: -3, color: colors.text },
  monoSmall:  { fontFamily: mono, fontSize: 11, letterSpacing: 0.5, color: colors.textTertiary },

  // Eyebrow — small caps mono labels
  eyebrow: { fontFamily: mono, fontSize: 10, letterSpacing: 1.8, color: colors.textTertiary, textTransform: 'uppercase' as const },
};

// --- Border Radius ---
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  pill: 999,
};

// --- Shadows: warm ember, not blue ---
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#9B8AE8',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
  }),
  cardElevated: Platform.select({
    ios: {
      shadowColor: '#9B8AE8',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
  }),
  glow: Platform.select({
    ios: {
      shadowColor: '#9B8AE8',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
    },
    android: { elevation: 8 },
  }),
};

// --- Card Styles ---
export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  padding: spacing.lg,
  ...shadows.card,
};

export const cardElevatedStyle = {
  backgroundColor: colors.cardElevated,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: 'rgba(165,160,200,0.1)',
  padding: spacing.lg,
  ...shadows.cardElevated,
};
