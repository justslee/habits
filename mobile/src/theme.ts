import { Platform } from 'react-native';

// --- Colors: indigo-tinted dark mode ---
export const colors = {
  // Backgrounds — indigo undertone throughout (high blue channel)
  bg: '#0B0D1A',
  card: '#131525',
  cardElevated: '#1A1D35',
  input: '#242645',

  // Text — indigo-gray, not pure gray
  text: '#EEEEF5',
  textSecondary: '#9B9BC0',
  textTertiary: '#5B5B80',

  // Accent
  accent: '#6366F1',
  accentLight: '#818CF8',
  accentMuted: 'rgba(99,102,241,0.15)',
  accentGlow: 'rgba(99,102,241,0.25)',

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

  // Borders — indigo-tinted
  border: 'rgba(129,140,248,0.06)',
  borderFocus: 'rgba(99,102,241,0.35)',

  // Chart
  chartLine: '#6366F1',
  chartFill: 'rgba(99,102,241,0.08)',
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
// Font families loaded via @expo-google-fonts/inter in App.tsx
const regular = 'Inter_400Regular';
const medium = 'Inter_500Medium';
const semibold = 'Inter_600SemiBold';
const bold = 'Inter_700Bold';

export const typography = {
  display: { fontSize: 48, fontFamily: bold, letterSpacing: -1.5 },
  title1: { fontSize: 28, fontFamily: bold, letterSpacing: -0.5 },
  title2: { fontSize: 22, fontFamily: semibold, letterSpacing: -0.3 },
  title3: { fontSize: 18, fontFamily: semibold, letterSpacing: 0 },
  body: { fontSize: 15, fontFamily: regular, letterSpacing: 0 },
  bodyBold: { fontSize: 15, fontFamily: semibold, letterSpacing: 0 },
  caption: { fontSize: 13, fontFamily: medium, letterSpacing: 0.2 },
  micro: { fontSize: 11, fontFamily: semibold, letterSpacing: 0.5 },
};

// --- Border Radius ---
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

// --- Shadows: colored indigo, not black ---
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
  }),
  cardElevated: Platform.select({
    ios: {
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
  }),
  glow: Platform.select({
    ios: {
      shadowColor: '#6366F1',
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
  borderColor: 'rgba(129,140,248,0.08)',
  padding: spacing.lg,
  ...shadows.cardElevated,
};
