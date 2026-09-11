/**
 * Liquid design tokens — ported verbatim from docs/prototypes/liquid.
 *
 * Two appearances share one design: Pearl (light) and Ink (dark). Every colour below is the
 * exact `light-dark(pearl, ink)` pair from the prototype's CSS custom properties, so the app
 * and the prototype resolve to the same hex.
 */

export type Appearance = 'auto' | 'pearl' | 'ink';
export type Look = 'pearl' | 'ink';
export type MotionSetting = 'fluid' | 'quiet';

export interface Palette {
  bg: string;
  panel: string;
  panel2: string;
  fg: string;
  muted: string;
  line: string;
  accent: string;
  soft: string;
  on: string;
  green: string;
  warm: string;
  shadow: string;
  scrim: string;
  /** North Star */
  jade: string;
  pillars: [string, string, string, string, string];
  /** Food cover / recipe art */
  artBg: string;
  artFg: string;
}

/** `light-dark(#f1f0ea, #11121a)` → pearl first, ink second. */
export const PEARL: Palette = {
  bg: '#f1f0ea',
  panel: '#fbfaf6',
  panel2: '#e8e6df',
  fg: '#25272b',
  muted: '#72716e',
  line: '#dddcd4',
  accent: '#655885',
  soft: '#e7e1f0',
  on: '#fffdf8',
  green: '#45654f',
  warm: '#755b3e',
  shadow: 'rgba(60,52,66,0.12)',
  scrim: 'rgba(36,37,54,0.27)',
  jade: '#337666',
  pillars: ['#966a23', '#417867', '#76629c', '#52768f', '#985f79'],
  artBg: '#e7dccc',
  artFg: '#70553f',
};

export const INK: Palette = {
  bg: '#11121a',
  panel: '#1c1e29',
  panel2: '#252736',
  fg: '#f0eee9',
  muted: '#a4a2b3',
  line: '#323442',
  accent: '#bdafe1',
  soft: '#353045',
  on: '#222030',
  green: '#a2c5a3',
  warm: '#d7b68e',
  shadow: 'rgba(0,0,0,0.25)',
  scrim: 'rgba(5,6,11,0.6)',
  jade: '#9dd8c0',
  pillars: ['#e0b775', '#88c3ad', '#b9a4e8', '#97bed8', '#dba5c0'],
  artBg: '#383032',
  artFg: '#dbba93',
};

export const palettes: Record<Look, Palette> = { pearl: PEARL, ink: INK };

/**
 * North Star's header has a key per appearance: the aurora at night for Ink, and first light —
 * the hour before dawn, when the guiding star is the last one out — for Pearl. Same subject,
 * opposite key, so the header belongs to the page it sits on.
 */
export const AURORA = {
  bg: '#0a1922',
  fg: '#f6f3e9',
  eyebrow: '#bbd8cc',
  em: '#b9e5d0',
  caption: '#b0c0bd',
  wordmarkStar: '#e9d5a8',
  actionBg: '#10222b',
  actionLine: '#46645f',
  actionFg: '#e0ebe4',
  statusBg: '#091820',
  statusFg: '#f3f4ef',
  statusMuted: '#adbebc',
};

export const AURORA_PEARL: typeof AURORA = {
  bg: '#eae6dd',
  fg: '#25272b',
  eyebrow: '#5d6570',
  em: '#2f6f60',
  caption: '#6a6f75',
  wordmarkStar: '#a8823a',
  actionBg: 'rgba(255,253,248,0.82)',
  actionLine: '#c9cfd8',
  actionFg: '#3a4149',
  statusBg: '#dfe3e9',
  statusFg: '#25272b',
  statusMuted: '#6a6f75',
};

export const fonts = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
};

/** Font sizes, line heights and letter spacing, straight from the prototype's CSS. */
export const type = {
  title: { fontFamily: fonts.serif, fontSize: 46, lineHeight: 46 * 0.99, letterSpacing: -1.4 },
  dailyTitle: { fontFamily: fonts.serif, fontSize: 43, lineHeight: 43 * 1.12, letterSpacing: -1.4 },
  subtitle: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 30 * 1.12, letterSpacing: -0.6 },
  sectionHeading: { fontFamily: fonts.serif, fontSize: 25, lineHeight: 25 * 1.15 },
  sheetHeading: { fontFamily: fonts.serif, fontSize: 31, lineHeight: 31 * 1.12, letterSpacing: -0.6 },
  panelTitle: { fontFamily: fonts.serif, fontSize: 35, lineHeight: 35 * 1.1, letterSpacing: -0.6 },
  money: { fontFamily: fonts.serif, fontSize: 61, lineHeight: 61, letterSpacing: -2 },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 13 * 1.6 },
  small: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 11 * 1.5 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 11 * 1.5, letterSpacing: 1.55 },
};

export const radius = {
  phone: 38,
  hero: 25,
  panel: 23,
  session: 26,
  sheet: 29,
  sheetBottom: 35,
  nav: 25,
  navPill: 21,
  button: 16,
  card: 21,
  habit: 18,
  chip: 14,
  badge: 10,
  small: 12,
};

/** Motion durations in ms, from the refinement pass. */
export const motion = {
  press: 150,
  context: 170,
  cardRelease: 190,
  sheetExit: 180,
  detail: 210,
  selection: 220,
  selectionSlow: 240,
  sheet: 260,
  northWell: 330,
  base: 360,
};

/** Gesture thresholds in points, from the prototype. */
export const gesture = {
  hold: 500,
  cancelMove: 9,
  horizontalIntent: 8,
  commit: 65,
  maxFollow: 125,
  flickVelocity: 0.65,
  flickMinDrag: 24,
  cueThrottle: 65,
};

/** The six destinations, in the revised order. North Star is second. */
export interface TabSpec { key: string; icon: string; label: string; a11y?: string }

export const TABS: TabSpec[] = [
  { key: 'Daily', icon: 'sunny-outline', label: 'Daily' },
  { key: 'NorthStar', icon: 'sparkles-outline', label: 'North', a11y: 'North Star' },
  { key: 'Train', icon: 'barbell-outline', label: 'Train' },
  { key: 'Speak', icon: 'pulse-outline', label: 'Speak' },
  { key: 'Food', icon: 'restaurant-outline', label: 'Food' },
  { key: 'Me', icon: 'person-outline', label: 'Me' },
];

export const ASSISTANT_LABEL: Record<string, string> = {
  Daily: 'A little help with your day',
  Train: 'Ask your training coach',
  Food: 'Your kitchen, taken care of',
  Speak: 'Talk it through',
  NorthStar: 'Make space for what matters',
  Me: 'What should I remember?',
};
