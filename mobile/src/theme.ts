import { Platform } from 'react-native';

// --- Colors: layered depth, not flat ---
export const colors = {
  // Backgrounds (darkest → lightest)
  bg: '#09090F',
  card: '#12121E',
  cardElevated: '#1A1A2E',
  input: '#242438',

  // Text hierarchy
  text: '#F0F0F5',
  textSecondary: '#A0A0B8',
  textTertiary: '#5C5C72',

  // Accent
  accent: '#6366F1',
  accentMuted: 'rgba(99,102,241,0.12)',

  // Semantic
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Pillar colors — single source of truth
  pillarQuant: '#8B5CF6',
  pillarMacro: '#06B6D4',
  pillarML: '#F97316',
  pillarAI: '#22D3EE',
  pillarSpeaking: '#EC4899',

  // Borders
  border: 'rgba(255,255,255,0.03)',
  borderFocus: 'rgba(99,102,241,0.25)',

  // Chart
  chartLine: '#6366F1',
  chartFill: 'rgba(99,102,241,0.06)',
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
const fontFamily = Platform.OS === 'ios' ? 'Inter' : 'Inter';

export const typography = {
  display: { fontSize: 48, fontWeight: '700' as const, letterSpacing: -1.5, fontFamily },
  title1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, fontFamily },
  title2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3, fontFamily },
  title3: { fontSize: 18, fontWeight: '600' as const, letterSpacing: 0, fontFamily },
  body: { fontSize: 15, fontWeight: '400' as const, letterSpacing: 0, fontFamily },
  bodyBold: { fontSize: 15, fontWeight: '600' as const, letterSpacing: 0, fontFamily },
  caption: { fontSize: 13, fontWeight: '500' as const, letterSpacing: 0.2, fontFamily },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5, fontFamily },
};

// --- Border Radius ---
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

// --- Card Styles ---
export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  padding: spacing.lg,
};

export const cardElevatedStyle = {
  backgroundColor: colors.cardElevated,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.05)',
  padding: spacing.lg,
};
