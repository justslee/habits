/**
 * API client for Mastery Tracker backend.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

export interface EntryCreatePayload {
  description: string;
  time_invested_minutes: number;
  pillar_tags: number[];
  difficulty_rating: number;
  energy_level: number;
  key_takeaway: string;
  entry_date?: string; // YYYY-MM-DD
}

export interface PillarSuggestion {
  pillar_id: number;
  pillar_name: string;
  confidence: number;
  sub_topics: string[];
}

export interface SuggestTagsResponse {
  suggestions: PillarSuggestion[];
}

export interface EntryResponse {
  id: number;
  user_id: number;
  entry_date: string;
  description: string;
  time_invested_minutes: number;
  pillar_tags: number[];
  difficulty_rating: number;
  energy_level: number;
  key_takeaway: string;
  created_at: string;
  updated_at: string;
  evaluation: null | {
    id: number;
    depth_score: number;
    relevance_score: number;
    consistency_multiplier: number;
    one_percent_better: boolean;
    verdict_explanation: string;
    commentary: string;
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export function createEntry(payload: EntryCreatePayload): Promise<EntryResponse> {
  return request('/api/v1/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function suggestTags(description: string): Promise<SuggestTagsResponse> {
  return request('/api/v1/entries/suggest-tags', {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
}

// Dashboard types

export interface HoursBreakdown {
  all_time: number;
  this_week: number;
  this_month: number;
}

export interface PillarStats {
  pillar_id: number;
  pillar_name: string;
  total_hours: number;
  avg_depth_score: number | null;
  entry_count: number;
}

export interface StreakData {
  id: number;
  pillar_id: number;
  pillar_name: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  days_since_break: number | null;
}

export interface DashboardStats {
  hours: HoursBreakdown;
  pillar_breakdown: PillarStats[];
  avg_depth_score: number | null;
  trend: string;
  streaks: StreakData[];
}

export interface HeatmapDay {
  date: string;
  count: number;
  pillars: number[];
}

export function getDashboardStats(): Promise<DashboardStats> {
  return request('/api/v1/dashboard/stats');
}

export function getHeatmap(days: number = 365): Promise<HeatmapDay[]> {
  return request(`/api/v1/dashboard/heatmap?days=${days}`);
}

export interface DepthProgressionPoint {
  date: string;
  depth_score: number;
  pillar_id: number;
  pillar_name: string;
}

// Workout types

export interface ExerciseLogData {
  exercise_name: string;
  set_number: number;
  weight?: number;
  reps?: number;
  rpe?: number;
  is_warmup?: boolean;
  notes?: string;
  duration_minutes?: number;
  distance_miles?: number;
}

export interface WorkoutSession {
  id: number;
  session_date: string;
  day_type: string;
  status: string;
  whoop_recovery_score: number | null;
  whoop_hrv: number | null;
  whoop_resting_hr: number | null;
  whoop_sleep_score: number | null;
  ai_plan: string | null;
  coach_notes: string | null;
  overall_rpe: number | null;
  exercises: ExerciseLogData[];
}

export interface ExerciseProfileData {
  id: number;
  exercise_name: string;
  muscle_group: string;
  current_working_weight: number | null;
  current_rep_target: number | null;
  current_set_target: number | null;
  estimated_1rm: number | null;
  progression_status: string;
  stall_count: number;
  mesocycle_phase: string;
  mesocycle_week: number;
}

export interface ChatResponseData {
  coach_response: string;
  parsed_sets: ExerciseLogData[];
  session_summary: string | null;
}

export function getTodayWorkout(): Promise<WorkoutSession> {
  return request('/api/v1/workouts/today');
}

export function getWorkoutSessions(limit: number = 20): Promise<WorkoutSession[]> {
  return request(`/api/v1/workouts/?limit=${limit}`);
}

export function createWorkoutSession(data: {
  day_type: string;
  exercises?: ExerciseLogData[];
}): Promise<WorkoutSession> {
  return request('/api/v1/workouts/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function addExerciseLog(
  sessionId: number,
  data: ExerciseLogData,
): Promise<ExerciseLogData> {
  return request(`/api/v1/workouts/${sessionId}/exercises`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function chatWithCoach(
  sessionId: number,
  message: string,
): Promise<ChatResponseData> {
  return request(`/api/v1/workouts/${sessionId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function getExerciseProfiles(): Promise<ExerciseProfileData[]> {
  return request('/api/v1/workouts/exercises/profiles');
}

// Run types

export interface RunSplitData {
  mile_number: number;
  pace_seconds: number;
  pace_formatted?: string;
  elevation_change_ft?: number;
}

export interface RunSessionData {
  id: number;
  run_date: string;
  distance_miles: number;
  duration_seconds: number;
  avg_pace_seconds: number | null;
  avg_pace_formatted: string;
  duration_formatted: string;
  elevation_gain_ft: number | null;
  run_type: string | null;
  rpe: number | null;
  ai_feedback: string | null;
  status: string;
  splits: RunSplitData[];
}

export interface RunStatsData {
  total_runs: number;
  total_miles: number;
  total_time_seconds: number;
  avg_pace_seconds: number | null;
  this_week_miles: number;
  this_month_miles: number;
  longest_run_miles: number;
  fastest_pace_seconds: number | null;
}

export interface PRData {
  distance_label: string;
  time_seconds: number;
  time_formatted: string;
  record_date: string;
}

export function getRuns(limit: number = 20): Promise<RunSessionData[]> {
  return request(`/api/v1/runs/?limit=${limit}`);
}

export function getRunStats(): Promise<RunStatsData> {
  return request('/api/v1/runs/stats');
}

export function getRunPRs(): Promise<PRData[]> {
  return request('/api/v1/runs/prs');
}

export function getDepthProgression(
  days: number = 90,
  pillarId?: number,
): Promise<DepthProgressionPoint[]> {
  let url = `/api/v1/dashboard/depth-progression?days=${days}`;
  if (pillarId !== undefined) url += `&pillar_id=${pillarId}`;
  return request(url);
}
