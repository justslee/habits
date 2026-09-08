/**
 * API client for Mastery Tracker backend.
 * API_URL / API_KEY resolution order:
 * 1. Settings saved on the device (Me → Server) — changeable without a rebuild
 * 2. Runtime /config.json (web only)
 * 3. Build-time EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_KEY
 * 4. Fallback to localhost:8000
 *
 * `API_URL` and `API_KEY` are live `let` bindings: screens that import API_URL
 * see the updated value after the user changes the server.
 */

import { Platform } from 'react-native';
import { DEFAULT_API_KEY, DEFAULT_SERVER_URL, loadServerSettings } from '../services/settings';

let API_URL = DEFAULT_SERVER_URL;
let API_KEY = DEFAULT_API_KEY;

const _listeners = new Set<() => void>();

/** Subscribe to server URL/key changes (used by the connectivity hook). */
export function subscribeServerChange(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** Apply new server settings immediately (after the user saves them). */
export function setRuntimeServer(serverUrl: string, apiKey: string): void {
  API_URL = serverUrl;
  API_KEY = apiKey;
  _listeners.forEach((fn) => fn());
}

export function getApiUrl(): string {
  return API_URL;
}

const _configPromise: Promise<void> = (async () => {
  if (Platform.OS === 'web') {
    try {
      const res = await fetch('/config.json', { cache: 'no-store' });
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.apiUrl) API_URL = cfg.apiUrl;
      }
    } catch {
      // config.json not available — use build-time value
    }
  }
  try {
    const saved = await loadServerSettings();
    if (saved.isCustom) {
      API_URL = saved.serverUrl;
      API_KEY = saved.apiKey;
    }
  } catch {
    // keep defaults
  }
})();

/** Wait until saved settings have been applied (call before the first request). */
export function serverReady(): Promise<void> {
  return _configPromise;
}

/**
 * Probe a server. Checks /health (public) and, when a key is given, an authed
 * endpoint so a wrong API key is reported as such rather than as "offline".
 */
export async function checkHealth(
  opts: { serverUrl?: string; apiKey?: string; timeoutMs?: number } = {},
): Promise<{ ok: boolean; error: string | null }> {
  await _configPromise;
  const base = opts.serverUrl ?? API_URL;
  const key = opts.apiKey ?? API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5_000);
  try {
    const health = await fetch(`${base}/health`, { signal: controller.signal });
    if (!health.ok) return { ok: false, error: `Server responded ${health.status}` };
    const authed = await fetch(`${base}/api/v1/devices`, {
      headers: key ? { 'X-API-Key': key } : {},
      signal: controller.signal,
    });
    if (authed.status === 401) return { ok: false, error: 'API key rejected' };
    if (authed.status === 503) return { ok: false, error: 'Server has no API key configured' };
    return { ok: true, error: null };
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'Timed out' : 'Unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}

export interface EntryCreatePayload {
  description: string;
  time_invested_minutes: number;
  pillar_tags: number[];
  difficulty_rating: number;
  energy_level: number;
  key_takeaway: string;
  entry_date?: string; // YYYY-MM-DD
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

// --- Devices (server-initiated push) ---

export interface DeviceRegistration {
  expo_push_token: string;
  platform?: string;
  app_version?: string;
  build_number?: string;
  device_name?: string;
}

export function registerDevice(payload: DeviceRegistration): Promise<{ id: number }> {
  return request('/api/v1/devices', { method: 'POST', body: JSON.stringify(payload) });
}

export function createEntry(payload: EntryCreatePayload): Promise<EntryResponse> {
  // Entry creation triggers LLM evaluation (~30-60s)
  return request('/api/v1/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 120_000,
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

export function getWorkoutSession(sessionId: number): Promise<WorkoutSession> {
  return request(`/api/v1/workouts/${sessionId}`);
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

export interface CreateRunInput {
  run_date?: string; // YYYY-MM-DD
  distance_miles: number;
  duration_seconds: number;
  elevation_gain_ft?: number | null;
  run_type?: string | null;
  rpe?: number | null;
  notes?: string | null;
}

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

export function createRun(input: CreateRunInput): Promise<RunSessionData> {
  return request('/api/v1/runs/', {
    method: 'POST',
    body: JSON.stringify({ splits: [], ...input }),
  });
}

export function getTodayRun(): Promise<TodayRunData> {
  return request('/api/v1/runs/today-plan');
}

export function getActivePlan(): Promise<TrainingPlanData | null> {
  return request('/api/v1/runs/plans/active');
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

export function getCrossPillarLinks(): Promise<ConceptLinkData[]> {
  return request('/api/v1/concepts/cross-pillar');
}

