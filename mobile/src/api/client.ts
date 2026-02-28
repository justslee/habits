/**
 * API client for Mastery Tracker backend.
 * API_URL resolution order:
 * 1. Runtime config from /config.json (updated without rebuild)
 * 2. Build-time env var EXPO_PUBLIC_API_URL
 * 3. Fallback to localhost:8000
 */

let API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

const _configPromise: Promise<void> = (async () => {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.apiUrl) API_URL = cfg.apiUrl;
    }
  } catch {
    // config.json not available — use build-time value
  }
})();

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

async function request<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  await _configPromise;
  const { timeoutMs, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  };

  // Default 30s timeout; LLM endpoints can override with timeoutMs
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 30_000);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers,
      signal: controller.signal,
      ...fetchOptions,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Build headers for raw fetch calls (used by screens not yet migrated to client functions). */
export function apiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  };
}

export { API_URL };

export function createEntry(payload: EntryCreatePayload): Promise<EntryResponse> {
  // Entry creation triggers LLM evaluation (~30-60s)
  return request('/api/v1/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 120_000,
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
  plan_updated?: boolean;
  session_completed?: boolean;
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

// --- Training Plans (Phase 4) ---

export interface PlannedRunData {
  id: number;
  week_number: number;
  day_of_week: number;
  planned_date: string | null;
  run_type: string;
  target_distance_miles: number | null;
  target_pace_seconds: number | null;
  target_duration_minutes: number | null;
  description: string | null;
  structure: string | null;
  completed_run_id: number | null;
  status: string;
}

export interface TodayRunData {
  has_planned_run: boolean;
  planned_run: PlannedRunData | null;
  plan_name: string | null;
  week_number: number | null;
  total_weeks: number | null;
}

export interface TrainingPlanData {
  id: number;
  goal_type: string;
  fitness_level: string;
  start_date: string;
  end_date: string | null;
  current_week: number;
  total_weeks: number;
  status: string;
  planned_runs: PlannedRunData[];
}

export function getTodayRun(): Promise<TodayRunData> {
  return request('/api/v1/runs/today-plan');
}

export function getActivePlan(): Promise<TrainingPlanData | null> {
  return request('/api/v1/runs/plans/active');
}

export function createTrainingPlan(data: {
  goal_type: string;
  fitness_level?: string;
  available_days?: string;
  target_race_date?: string;
}): Promise<TrainingPlanData> {
  return request('/api/v1/runs/plans', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getPostRunFeedback(runId: number): Promise<{ feedback: string; is_pr: boolean; pr_type: string | null }> {
  return request(`/api/v1/runs/${runId}/feedback`, { method: 'POST' });
}

export function getDepthProgression(
  days: number = 90,
  pillarId?: number,
): Promise<DepthProgressionPoint[]> {
  let url = `/api/v1/dashboard/depth-progression?days=${days}`;
  if (pillarId !== undefined) url += `&pillar_id=${pillarId}`;
  return request(url);
}

// --- Entries list ---

export function getRecentEntries(days: number = 14): Promise<EntryResponse[]> {
  const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  return request(`/api/v1/entries?start_date=${start}`);
}

// --- Soft Delete / Restore ---

export function deleteEntry(entryId: number): Promise<{ detail: string; id: number }> {
  return request(`/api/v1/entries/${entryId}`, { method: 'DELETE' });
}

export function restoreEntry(entryId: number): Promise<EntryResponse> {
  return request(`/api/v1/entries/${entryId}/restore`, { method: 'POST' });
}

export function deleteWorkout(sessionId: number): Promise<{ detail: string; id: number }> {
  return request(`/api/v1/workouts/${sessionId}`, { method: 'DELETE' });
}

export function restoreWorkout(sessionId: number): Promise<WorkoutSession> {
  return request(`/api/v1/workouts/${sessionId}/restore`, { method: 'POST' });
}

export function deleteRun(runId: number): Promise<{ detail: string; id: number }> {
  return request(`/api/v1/runs/${runId}`, { method: 'DELETE' });
}

export function restoreRun(runId: number): Promise<RunSessionData> {
  return request(`/api/v1/runs/${runId}/restore`, { method: 'POST' });
}

// --- Unified Training Hub ---

export interface TrainingItem {
  id: number;
  type: 'workout' | 'run';
  date: string;
  label: string;
  detail: string;
  status: string;
  rpe: number | null;
  // Workout-specific
  day_type?: string;
  exercise_count?: number;
  total_volume?: number;
  // Run-specific
  run_type?: string;
  distance_miles?: number;
  pace_formatted?: string;
  duration_seconds?: number;
  is_pr?: boolean;
}

export interface WeekSummary {
  workouts: number;
  runs: number;
  total_hours: number;
  avg_rpe: number;
  run_miles: number;
}

export function getRecentTraining(days: number = 14): Promise<TrainingItem[]> {
  return request(`/api/v1/workouts/training/recent?days=${days}`);
}

export function getWeekSummary(): Promise<WeekSummary> {
  return request('/api/v1/workouts/training/week-summary');
}

// --- Route Discovery (GraphHopper) ---

export interface DiscoveredRoute {
  name: string;
  description: string;
  polyline: { lat: number; lng: number; alt?: number }[];
  distance_miles: number;
  elevation_gain_ft: number;
  difficulty: string;
  street_names: string[];
  estimated_time_minutes: number;
}

export interface RouteDiscoverResponse {
  routes: DiscoveredRoute[];
  cached: boolean;
}

export function discoverRoutes(
  latitude: number,
  longitude: number,
  distanceMiles: number = 3.0,
): Promise<RouteDiscoverResponse> {
  return request('/api/v1/routes/discover', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude, distance_miles: distanceMiles }),
    timeoutMs: 60_000,
  });
}

// --- Saved Routes ---

export interface SavedRouteData {
  id: number;
  name: string;
  distance_miles: number;
  elevation_gain_ft: number | null;
  route_type: string | null;
  tags: string | null;
  description: string | null;
  times_run: number;
  best_time_seconds: number | null;
  last_run_date: string | null;
}

export function getSavedRoutes(): Promise<SavedRouteData[]> {
  return request('/api/v1/routes/');
}

export function saveDiscoveredRoute(route: DiscoveredRoute): Promise<SavedRouteData> {
  return request('/api/v1/routes/discover/save', {
    method: 'POST',
    body: JSON.stringify({
      name: route.name,
      polyline: JSON.stringify(route.polyline),
      distance_miles: route.distance_miles,
      elevation_gain_ft: route.elevation_gain_ft,
      route_type: 'loop',
      tags: route.difficulty,
      description: route.description,
    }),
  });
}

// --- Vision Statement ---

export interface VisionData {
  id: number;
  vision_text: string | null;
  pillar_targets: Record<string, string> | null;
  time_horizon: Array<{ title: string; target_date: string }> | null;
  anti_goals: string[] | null;
}

export function getVision(): Promise<VisionData | null> {
  return request('/api/v1/vision');
}

export function saveVision(data: Partial<VisionData>): Promise<VisionData> {
  return request('/api/v1/vision', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- Concept Trees ---

export interface ConceptData {
  id: number;
  pillar_id: number;
  name: string;
  tier: number;
  description: string | null;
  prerequisites: string[] | null;
  status: 'not_started' | 'in_progress' | 'mastered';
  notes: string | null;
  key_resources: string | null;
  sort_order: number;
}

export interface TierGroup {
  tier: number;
  tier_name: string;
  concepts: ConceptData[];
}

export interface ConceptTreeData {
  pillar_id: number;
  total: number;
  mastered: number;
  in_progress: number;
  tiers: TierGroup[];
}

export function getPillarConcepts(pillarId: number): Promise<ConceptTreeData> {
  return request(`/api/v1/pillars/${pillarId}/concepts`);
}

export function seedPillarConcepts(
  pillarId: number,
  mode: 'quick' | 'research' = 'quick',
): Promise<ConceptTreeData> {
  // LLM generates 40-80 concepts — quick ~120s, research ~180s
  const timeoutMs = mode === 'research' ? 300_000 : 180_000;
  return request(`/api/v1/pillars/${pillarId}/concepts/seed`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
    timeoutMs,
  });
}

export function addConcept(
  pillarId: number,
  data: { name: string; tier: number; description?: string; key_resources?: string },
): Promise<ConceptData> {
  return request(`/api/v1/pillars/${pillarId}/concepts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateConcept(
  pillarId: number,
  conceptId: number,
  data: Partial<Pick<ConceptData, 'name' | 'tier' | 'description' | 'status' | 'notes' | 'key_resources' | 'sort_order'>>,
): Promise<ConceptData> {
  return request(`/api/v1/pillars/${pillarId}/concepts/${conceptId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteConcept(pillarId: number, conceptId: number): Promise<{ detail: string; id: number }> {
  return request(`/api/v1/pillars/${pillarId}/concepts/${conceptId}`, { method: 'DELETE' });
}

// --- Cross-Pillar Concept Links ---

export interface ConceptLinkData {
  id: number;
  concept_id_a: number;
  concept_id_b: number;
  concept_a_name?: string;
  concept_b_name?: string;
  pillar_a_name?: string;
  pillar_b_name?: string;
  link_type: 'shared_skill' | 'prerequisite' | 'related';
  description: string | null;
}

export function createConceptLink(data: {
  concept_id_a: number;
  concept_id_b: number;
  link_type: string;
  description?: string;
}): Promise<ConceptLinkData> {
  return request('/api/v1/concepts/links/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getConceptLinks(conceptId: number): Promise<ConceptLinkData[]> {
  return request(`/api/v1/concepts/${conceptId}/links`);
}

export function deleteConceptLink(linkId: number): Promise<{ detail: string }> {
  return request(`/api/v1/concepts/links/${linkId}`, { method: 'DELETE' });
}

export function getCrossPillarLinks(): Promise<ConceptLinkData[]> {
  return request('/api/v1/concepts/cross-pillar');
}
