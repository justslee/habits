/**
 * Shared training schedule constants.
 * Single source of truth for the weekly workout schedule used by
 * TrainHomeScreen and TrainingCalendarScreen.
 */

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const WEEKLY_SCHEDULE: { type: string; label: string; icon: string }[] = [
  { type: 'push', label: 'Push', icon: 'arrow-up-outline' },
  { type: 'pull', label: 'Pull', icon: 'arrow-down-outline' },
  { type: 'legs', label: 'Legs', icon: 'body-outline' },
  { type: 'rest', label: 'Rest', icon: 'bed-outline' },
  { type: 'cardio', label: 'Cardio', icon: 'heart-outline' },
  { type: 'basketball', label: 'Bball', icon: 'basketball-outline' },
  { type: 'rest', label: 'Rest', icon: 'bed-outline' },
];

export const DAY_TYPE_COLORS: Record<string, string> = {
  push: '#3B82F6',
  pull: '#8B5CF6',
  legs: '#10B981',
  cardio: '#F59E0B',
  basketball: '#EC4899',
  rest: '#6B7280',
};

export const RUN_TYPE_COLORS: Record<string, string> = {
  easy: '#3B82F6',
  tempo: '#F59E0B',
  intervals: '#EF4444',
  long: '#10B981',
  recovery: '#6B7280',
  fartlek: '#EC4899',
  progression: '#8B5CF6',
};

export const DAY_LABELS: Record<string, string> = {
  push: 'Push Day',
  pull: 'Pull Day',
  legs: 'Legs + Core',
  cardio: 'Cardio',
  basketball: 'Basketball',
  rest: 'Rest Day',
};
