/**
 * API client for the Rituals backend.
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
      if (typeof window !== 'undefined' && window.location?.origin && !process.env.EXPO_PUBLIC_API_URL) API_URL = window.location.origin;
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


// --- Food (two-week meal cycles) ---

export interface FoodIngredient {
  id: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  essential: boolean;
  essential_reason: string | null;
  preferred_store: string | null;
  shelf_stable: boolean;
}

export interface FoodRecipe {
  id: number;
  slug: string;
  title: string;
  source_site: string | null;
  source_url: string | null;
  rating: number | null;
  cuisine: string | null;
  protein_source: string | null;
  prep_minutes: number;
  cook_minutes: number;
  total_minutes: number;
  servings: number;
  protein_g_per_serving: number | null;
  prep_days: number;
  reheat: string;
  status: 'candidate' | 'proven' | 'retired';
  affinity: number;
  times_cooked: number;
  last_cooked: string | null;
  user_rating: number | null;
  notes: string | null;
  hue: number | null;
  /** Filled on demand from the recipe's own source; null until then. */
  method: { steps: string[]; equipment?: string[]; make_ahead?: string; source_note?: string } | null;
  ingredients: FoodIngredient[];
}

export interface FoodCycle {
  id: number;
  start_date: string;
  end_date: string;
  shop_date: string | null;
  status: string;
  travel_days: string[];
  eat_out_days: number;
  eating_days: number;
  deck_size: number;
}

export interface FoodDeck {
  cycle_id: number;
  eating_days: number;
  coverage: number;
  enough: boolean;
  exhausted: boolean;
  remaining_count: number;
  distinct_ingredients: number;
  ingredient_cap: number;
  kept: FoodRecipe[];
  cards: FoodRecipe[];
  learned: string[];
}

export interface FoodMeal {
  id: number;
  recipe: FoodRecipe;
  cook_date: string | null;
  days_covered: string[];
  servings: number;
  status: 'planned' | 'cooked' | 'skipped';
  rating: number | null;
}

export interface FoodPlan {
  cycle: FoodCycle;
  meals: FoodMeal[];
  covered_days: number;
  open_days: number;
}

export interface PantryEntry {
  ingredient_id: number;
  name: string;
  state: 'gone' | 'some' | 'plenty';
  shelf_stable: boolean;
  last_confirmed: string | null;
}

export interface TasteEntry { feature: string; label: string; weight: number }

export function getFoodRecipes(): Promise<FoodRecipe[]> {
  return request('/api/v1/food/recipes');
}
/** Fetch and cache this recipe's method, summarised from its source page. */
export function fetchRecipeMethod(recipeId: number, refresh = false): Promise<FoodRecipe> {
  return request(`/api/v1/food/recipes/${recipeId}/method${refresh ? '?refresh=true' : ''}`, { method: 'POST' });
}
export function getPantry(): Promise<PantryEntry[]> {
  return request('/api/v1/food/pantry');
}
export function putPantry(items: { ingredient_id: number; state: PantryEntry['state'] }[]): Promise<PantryEntry[]> {
  return request('/api/v1/food/pantry', { method: 'PUT', body: JSON.stringify({ items }) });
}
export function getCurrentCycle(): Promise<FoodCycle | null> {
  return request('/api/v1/food/cycles/current');
}
export function createCycle(input: { start_date?: string; travel_days?: string[]; eat_out_days?: number }): Promise<FoodCycle> {
  return request('/api/v1/food/cycles', { method: 'POST', body: JSON.stringify(input) });
}
export function getDeck(cycleId: number, spare = false): Promise<FoodDeck> {
  return request(`/api/v1/food/cycles/${cycleId}/deck${spare ? '?spare=1' : ''}`);
}
export function swipeCard(cycleId: number, input: { recipe_id: number; decision: 'keep' | 'skip'; dwell_ms?: number; spare?: boolean }): Promise<FoodDeck> {
  return request(`/api/v1/food/cycles/${cycleId}/swipe`, { method: 'POST', body: JSON.stringify(input) });
}
export function buildPlan(cycleId: number): Promise<FoodPlan> {
  return request(`/api/v1/food/cycles/${cycleId}/plan`, { method: 'POST' });
}
export function getPlan(cycleId: number): Promise<FoodPlan> {
  return request(`/api/v1/food/cycles/${cycleId}/plan`);
}
/** Put a different recipe in a planned slot, keeping its day and portions. */
export function swapCycleMeal(cycleId: number, mealId: number, recipeId: number): Promise<FoodPlan> {
  return request(`/api/v1/food/cycles/${cycleId}/meals/${mealId}/swap`, { method: 'POST', body: JSON.stringify({ recipe_id: recipeId }) });
}
/** Drop a meal from the plan; the days it covered open up again. */
export function removeCycleMeal(cycleId: number, mealId: number): Promise<FoodPlan> {
  return request(`/api/v1/food/cycles/${cycleId}/meals/${mealId}`, { method: 'DELETE' });
}
export function markCooked(cycleId: number, mealId: number, input: { cooked: boolean; rating?: number }): Promise<FoodPlan> {
  return request(`/api/v1/food/cycles/${cycleId}/meals/${mealId}/cooked`, { method: 'POST', body: JSON.stringify(input) });
}
export function completeCycle(cycleId: number): Promise<FoodCycle> {
  return request(`/api/v1/food/cycles/${cycleId}/complete`, { method: 'POST' });
}
export function getTaste(): Promise<{ profile: TasteEntry[] }> {
  return request('/api/v1/food/taste');
}

// --- Food bags (F3) ---

export interface BagItem {
  ingredient_id: number;
  name: string;
  packs: number;
  pack_label: string;
  unit_price: number;
  line_total: number;
  uses: number;
  recipes: string[];
  shelf_stable: boolean;
  alt_stores: string[];
  waste_note: string | null;
  projected_waste_value: number;
  moved_from: string | null;
}

export interface Bag {
  id: number;
  store: string;
  name: string;
  items: BagItem[];
  goods_total: number;
  minimum: number;
  delivery_fee: number;
  short: boolean;
  shortfall: number;
  projected_waste: number;
  status: string;
}

export interface BagsResponse {
  cycle_id: number;
  bags: Bag[];
  goods_total: number;
  fees_total: number;
  total: number;
  budget_per_cycle: number;
  over_budget: number;
  store_count: number;
}

export function buildBags(cycleId: number): Promise<BagsResponse> {
  return request(`/api/v1/food/cycles/${cycleId}/bags`, { method: 'POST' });
}
export function getBags(cycleId: number): Promise<BagsResponse> {
  return request(`/api/v1/food/cycles/${cycleId}/bags`);
}
export function approveBags(cycleId: number): Promise<BagsResponse> {
  return request(`/api/v1/food/cycles/${cycleId}/bags/approve`, { method: 'POST' });
}

// --- Food carts, gate, orders, spend (F4–F5) ---

export interface CartLine { name: string; qty: number; unit_price: number; line_total: number; product: string }
export interface CartEvent { ts: string; event: string; detail: string | null }
export interface CartTask {
  id: number;
  bag_id: number;
  store: string;
  name: string;
  status: 'queued' | 'building' | 'needs_review' | 'approved' | 'placing' | 'awaiting_human' | 'placed' | 'failed' | 'rejected';
  supervised: boolean;
  cart_lines: CartLine[];
  cart_total: number | null;
  screenshot_path: string | null;
  error: string | null;
  attempts: number;
  events: CartEvent[];
  approval_expires_at: string | null;
  order: { merchant_order_id: string | null; total: number; placed_at: string; placed_by: string; delivery_window: string | null } | null;
}
export interface FoodSettingsData {
  discovery_prompt: string | null;
  budget_per_cycle: number; per_order_cap: number; per_cycle_cap: number; ordering_enabled: boolean;
  supervised_cycles_remaining: number; approval_ttl_minutes: number; total_tolerance: number;
}
export interface SpendSummary {
  current: null | {
    cycle_id: number; goods: number; fees: number; total: number; per_eating_day: number; per_serving: number;
    protein_g_per_dollar: number | null; budget_per_cycle: number; vs_budget: number; orders: number;
    per_meal: { meal_id: number; title: string; cost: number; per_serving: number; protein_g_per_dollar: number | null }[];
  };
  history: { cycle_id: number; label: string; by_store: Record<string, number>; goods: number; fees: number; total: number }[];
  average_total: number;
  budget_per_cycle: number;
}

export function getCarts(cycleId: number): Promise<CartTask[]> {
  return request(`/api/v1/food/cycles/${cycleId}/carts`);
}
export function runCart(taskId: number): Promise<CartTask> {
  return request(`/api/v1/food/carts/${taskId}/run`, { method: 'POST' });
}
export function approveCart(taskId: number, biometric: boolean): Promise<{ cart: CartTask; token: string; expires_at: string }> {
  return request(`/api/v1/food/carts/${taskId}/approve`, { method: 'POST', body: JSON.stringify({ biometric }) });
}
export function placeCart(taskId: number, token: string): Promise<CartTask> {
  return request(`/api/v1/food/carts/${taskId}/place`, { method: 'POST', body: JSON.stringify({ token }) });
}
export function confirmPlaced(taskId: number, merchantOrderId?: string): Promise<CartTask> {
  return request(`/api/v1/food/carts/${taskId}/confirm-placed`, { method: 'POST', body: JSON.stringify({ merchant_order_id: merchantOrderId ?? null }) });
}
export function rejectCart(taskId: number, reason?: string): Promise<CartTask> {
  return request(`/api/v1/food/carts/${taskId}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason ?? null }) });
}
export function getFoodSettings(): Promise<FoodSettingsData> {
  return request('/api/v1/food/settings');
}
export function patchFoodSettings(p: Partial<FoodSettingsData>): Promise<FoodSettingsData> {
  return request('/api/v1/food/settings', { method: 'PATCH', body: JSON.stringify(p) });
}
export function getSpend(): Promise<SpendSummary> {
  return request('/api/v1/food/spend');
}

// --- Calendar (app-wide, Google Calendar via secret iCal address) ---

export interface CalendarFeedData {
  id: number; label: string; url_host: string; enabled: boolean; last_synced_at: string | null; last_error: string | null; events: number; travel_spans: number;
}
export interface CalendarEventData {
  id: number; summary: string | null; location: string | null; start_date: string; end_date: string; all_day: boolean;
  start_at: string | null; end_at: string | null; kind: 'travel' | 'workout' | 'meeting' | 'other'; recurring: boolean;
}
export interface CalendarToday { date: string; connected: boolean; travelling: boolean; travel: string | null; events: CalendarEventData[] }
export interface TravelSpanData {
  id: number; start_date: string; end_date: string; days: number; summary: string | null; reason: string | null; confirmed: boolean; ignored: boolean;
}
export function getCalendarFeeds(): Promise<CalendarFeedData[]> {
  return request('/api/v1/calendar/feeds');
}
export function putCalendarFeed(url: string): Promise<CalendarFeedData> {
  return request('/api/v1/calendar/feeds', { method: 'PUT', body: JSON.stringify({ url }), timeoutMs: 90_000 });
}
export function syncCalendar(): Promise<CalendarFeedData[]> {
  return request('/api/v1/calendar/sync', { method: 'POST', timeoutMs: 90_000 });
}
export function deleteCalendarFeed(): Promise<{ deleted: boolean }> {
  return request('/api/v1/calendar/feeds', { method: 'DELETE' });
}
export function getCalendarToday(): Promise<CalendarToday> {
  return request('/api/v1/calendar/today');
}
export function getCalendarEvents(start: string, end: string): Promise<CalendarEventData[]> {
  return request(`/api/v1/calendar/events?start=${start}&end=${end}`);
}
export function getTravel(): Promise<TravelSpanData[]> {
  return request('/api/v1/food/travel');
}
export function patchTravel(id: number, p: { confirmed?: boolean; ignored?: boolean }): Promise<TravelSpanData> {
  return request(`/api/v1/food/travel/${id}`, { method: 'PATCH', body: JSON.stringify(p) });
}
export function addTravel(p: { start_date: string; end_date: string; summary?: string }): Promise<TravelSpanData> {
  return request('/api/v1/food/travel', { method: 'POST', body: JSON.stringify(p) });
}

// --- Food recipes catalogue, discovery, stores ---

export interface MerchantData {
  store: string; name: string; site_url: string | null; location: string | null; channel: 'site' | 'doordash' | 'amazon';
  quality_tier: 'high' | 'standard'; minimum: number; delivery_fee: number; enabled: boolean; supervised: boolean;
  deal_text: string | null; deal_value: number; deal_min: number; deal_expires: string | null; deal_active: boolean;
}
export interface DiscoverLog { url: string; outcome: string; title?: string; detail?: string }
export interface DiscoverResult { added: { id: number; title: string; source: string | null; rating: number | null; ingredients: number }[]; skipped: number; checked: number; log?: DiscoverLog[]; mode?: string }

export function patchRecipe(id: number, p: { status?: 'candidate' | 'proven' | 'retired'; notes?: string; user_rating?: number }): Promise<FoodRecipe> {
  return request(`/api/v1/food/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(p) });
}
export function patchEssential(recipeId: number, riId: number, essential: boolean): Promise<FoodRecipe> {
  return request(`/api/v1/food/recipes/${recipeId}/ingredients/${riId}`, { method: 'PATCH', body: JSON.stringify({ essential }) });
}
export function discoverRecipes(limit = 6): Promise<DiscoverResult> {
  return request(`/api/v1/food/discover?limit=${limit}`, { method: 'POST', timeoutMs: 180_000 });
}
export function getMerchants(): Promise<MerchantData[]> {
  return request('/api/v1/food/merchants');
}
export function patchMerchant(store: string, p: Partial<MerchantData>): Promise<MerchantData> {
  return request(`/api/v1/food/merchants/${store}`, { method: 'PATCH', body: JSON.stringify(p) });
}
export function createMerchant(p: { store: string; name: string; channel?: string; location?: string; minimum?: number; delivery_fee?: number; deal_text?: string; deal_value?: number; deal_min?: number }): Promise<MerchantData> {
  return request('/api/v1/food/merchants', { method: 'POST', body: JSON.stringify(p) });
}
export function scanDeals(): Promise<{ mode: string; deals: any[]; note?: string }> {
  return request('/api/v1/food/merchants/scan-deals', { method: 'POST', timeoutMs: 120_000 });
}

// --- Train: the golf performance program ---

export interface TrainExercise {
  name: string; sets: number; reps: string; kind: 'main' | 'accessory' | 'core' | 'power' | 'carry';
  per_side: boolean; rest: string | null; notes: string | null; superset: string | null; pair: string | null;
  omit_first: boolean; rpe?: string; load: number | null; load_note: string | null;
}
export interface TrainBlock { name: string; minutes: number; exercises: TrainExercise[] }
export interface TrainPrescription {
  session: string; title: string; phase: string; phase_name: string; phase_notes?: string; week_kind: 'normal' | 'lighter' | 'tournament' | 'travel';
  rotation: 'A' | 'B'; target_minutes: [number, number]; budget: string; warmup: string[]; blocks: TrainBlock[];
  run: { minutes: number; structure: string; intervals?: number; miles?: number | null; intensity?: string } | null; mobility: [string, string][]; rules: string[];
  estimated_duration_minutes?: number; day_note?: string | null; adjusted?: AdjustKind | null; shortened_to?: number;
}
export type AdjustKind = 'run' | 'rest' | 'golf' | 'swap' | 'move' | 'shorten';
export interface TrainDay {
  date: string; weekday: string; session: string | null; label: string; travel: boolean; note: string | null; status: string | null; session_id: number | null;
  adjusted?: AdjustKind | null; adjustment_id?: number | null; detail?: Record<string, any> | null; run_id?: number | null;
}
export interface TrainAdjustment { id: number; date: string; kind: AdjustKind; params: Record<string, any>; reason: string | null; summary: string | null; created_at: string | null }
export interface TrainWeek { week_start: string; week_kind: string; rotation: string; phase: string; days: TrainDay[]; adjustments: TrainAdjustment[] }
export interface AdjustResult { adjustment: TrainAdjustment | null; changes: string[]; note: string | null; week: TrainWeek; today: TrainToday }
export interface TrainProgram {
  start: string; first_event: string; five_sessions: boolean;
  phase: { key: string; name: string; start: string; end: string; strength: string; running: string; rpe: string };
  phases: { key: string; name: string; start: string; end: string }[];
  week_kind: string; rotation: string; lighter_weeks: string[]; next_lighter_week: string | null;
  sessions: Record<string, { title: string; target_minutes: [number, number]; budget: string }>;
  mobility: { movement: string; dose: string }[]; banned: string[]; spec_ok: boolean;
}
export interface TrainToday { date: string; day: TrainDay | null; prescription: TrainPrescription | null; session_id: number | null; status: string | null }
export interface GolfEventData { id: number; event_date: string; end_date: string | null; name: string; kind: string; notes: string | null }

export function getTrainProgram(): Promise<TrainProgram> { return request('/api/v1/train/program'); }
export function getTrainWeek(start?: string): Promise<TrainWeek> { return request(`/api/v1/train/week${start ? `?start=${start}` : ''}`); }
export function getTrainToday(): Promise<TrainToday> { return request('/api/v1/train/today'); }
export function startTrainToday(): Promise<{ session_id: number; status: string; created: boolean }> { return request('/api/v1/train/today/start', { method: 'POST' }); }
export function completeTrainSession(id: number, p: { overall_rpe?: number; minutes?: number; notes?: string }): Promise<{ session_id: number; status: string; progression: { exercise: string; weight?: number; note: string }[] }> {
  return request(`/api/v1/train/sessions/${id}/complete`, { method: 'POST', body: JSON.stringify(p) });
}
export function getTrainLog(start?: string): Promise<{ week_start: string; text: string }> { return request(`/api/v1/train/log${start ? `?start=${start}` : ''}`); }
export function getGolfEvents(): Promise<GolfEventData[]> { return request('/api/v1/train/events'); }
export function addGolfEvent(p: { event_date: string; name: string; kind?: string; end_date?: string }): Promise<{ id: number }> { return request('/api/v1/train/events', { method: 'POST', body: JSON.stringify(p) }); }
export function deleteGolfEvent(id: number): Promise<{ deleted: boolean }> { return request(`/api/v1/train/events/${id}`, { method: 'DELETE' }); }
export function patchTrainSettings(p: { first_event_date?: string; five_sessions?: boolean }): Promise<any> { return request('/api/v1/train/settings', { method: 'PATCH', body: JSON.stringify(p) }); }

// ---- Coach (program-aware text + OpenAI Realtime voice) ----
export interface RealtimeSession { client_secret: string; expires_at: number | null; model: string; voice: string; calls_url: string; context_chars: number; transcribe_model: string }
export function getRealtimeSession(): Promise<RealtimeSession> { return request('/api/v1/coach/realtime/session', { method: 'POST' }); }
export interface LiveSession { sdp: string; session_id: string | null; model: string; backend_model: string; context_chars: number }
/** Hand GPT-Live our WebRTC offer and get its answer. The Mac holds the key; we never see it. */
export function createLiveSession(sdp: string): Promise<LiveSession> {
  return request('/api/v1/coach/live/session', { method: 'POST', body: JSON.stringify({ sdp }), timeoutMs: 45_000 });
}
export function getCoachContext(): Promise<{ context: string }> { return request('/api/v1/coach/context'); }
export function coachChat(message: string, history: { from: 'me' | 'coach'; text: string }[] = []): Promise<{ reply: string; model: string; changes: string[]; adjustment_id: number | null }> {
  return request('/api/v1/coach/chat', { method: 'POST', body: JSON.stringify({ message, history }), timeoutMs: 90_000 });
}

// ---- Adaptive days: change a day, the week re-plans around it ----
export interface AdjustInput { date?: string; text?: string; kind?: AdjustKind; miles?: number; minutes?: number; intensity?: 'easy' | 'moderate' | 'hard'; session?: string; target_date?: string }
export function adjustTraining(p: AdjustInput): Promise<AdjustResult> { return request('/api/v1/train/adjust', { method: 'POST', body: JSON.stringify(p) }); }
export function getTrainAdjustments(start?: string): Promise<TrainAdjustment[]> { return request(`/api/v1/train/adjustments${start ? `?start=${start}` : ''}`); }
export function revertTrainAdjustment(id: number): Promise<AdjustResult> { return request(`/api/v1/train/adjustments/${id}`, { method: 'DELETE' }); }

// ---- Daily: rituals and the one thing that matters ----
export interface TodoData {
  id: number; text: string; todo_date: string; pillar_id: number | null; pillar_name: string | null;
  pillar_confidence: number | null; completed: boolean; estimated_minutes: number | null; sort_order: number;
}
export interface HabitData {
  id: number; name: string; icon: string | null; color: string | null; is_active: boolean;
  current_streak: number; longest_streak: number; total_completions: number; completed_today: boolean; sort_order: number;
}
export interface DailySummaryData {
  quote: string; quote_author: string; todos: TodoData[]; habits: HabitData[];
  workout_preview: string | null; workout_day_type: string | null;
}
export function getDailySummary(): Promise<DailySummaryData> { return request('/api/v1/daily/summary'); }
export function toggleHabitToday(id: number): Promise<{ completed: boolean; current_streak?: number }> {
  return request(`/api/v1/daily/habits/${id}/toggle`, { method: 'POST' });
}
export function completeTodo(id: number): Promise<TodoData> {
  return request(`/api/v1/daily/todos/${id}/complete`, { method: 'POST' });
}
export function createTodo(p: { text: string; estimated_minutes?: number | null; pillar_id?: number | null }): Promise<TodoData> {
  return request('/api/v1/daily/todos', { method: 'POST', body: JSON.stringify(p) });
}
export function updateTodo(id: number, p: { text?: string; estimated_minutes?: number | null; pillar_id?: number | null }): Promise<TodoData> {
  return request(`/api/v1/daily/todos/${id}`, { method: 'PUT', body: JSON.stringify(p) });
}
export function deleteTodo(id: number): Promise<unknown> { return request(`/api/v1/daily/todos/${id}`, { method: 'DELETE' }); }
export function deleteHabit(id: number): Promise<unknown> { return request(`/api/v1/daily/habits/${id}`, { method: 'DELETE' }); }
export function createHabit(p: { name: string; icon?: string | null; color?: string | null }): Promise<HabitData> {
  return request('/api/v1/daily/habits', { method: 'POST', body: JSON.stringify(p) });
}
export function updateHabit(id: number, p: { name?: string; icon?: string | null; color?: string | null }): Promise<HabitData> {
  return request(`/api/v1/daily/habits/${id}`, { method: 'PUT', body: JSON.stringify(p) });
}

// ---- Speak ----
export interface SpeakingSessionData {
  id: number; created_at: string; topic: string | null; audience: string | null;
  duration_seconds: number | null; overall_score: number | null; transcript: string | null;
}
export interface SpeakingStatsData {
  total_sessions: number; total_minutes: number; avg_scores: Record<string, number> | null;
  recent_trend: { recent_avg: number; early_avg: number; delta: number; improving: boolean } | null;
}
export function getSpeakingSessions(limit = 20): Promise<SpeakingSessionData[]> {
  return request(`/api/v1/speaking/sessions?limit=${limit}`);
}
export function getSpeakingStats(): Promise<SpeakingStatsData> { return request('/api/v1/speaking/stats'); }

// ---- Speaking: explain a concept to an audience, then read the evaluation ----
export interface SpeakingEvaluation {
  clarity_score: number; accuracy_score: number; structure_score: number;
  conciseness_score: number; confidence_score: number; overall_score: number;
  filler_words: Record<string, number>; filler_count: number;
  specific_feedback: Array<{ quote: string; feedback: string; type: string }>;
  pause_assessment: string; commentary: string;
}
export interface SpeakingSessionFull {
  id: number; topic: string; audience: string; actual_seconds: number;
  transcript: string; session_date: string; evaluation: SpeakingEvaluation | null;
}
export interface TopicSuggestion { topic: string; source: string; concept_id: number | null }

export function getTopicSuggestions(): Promise<TopicSuggestion[]> {
  return request('/api/v1/speaking/topics/suggest');
}
export function getSpeakingSession(id: number): Promise<SpeakingSessionFull> {
  return request(`/api/v1/speaking/sessions/${id}`);
}
export function getSpeakingHistory(limit = 20): Promise<SpeakingSessionFull[]> {
  return request(`/api/v1/speaking/sessions?limit=${limit}`);
}

/** Upload a recording for transcription and evaluation. Multipart, so it bypasses `request`. */
export async function submitSpeakingSession(input: {
  uri: string; topic: string; audience: string; targetSeconds: number; actualSeconds: number;
}): Promise<SpeakingSessionFull> {
  const form = new FormData();
  form.append('audio', { uri: input.uri, type: 'audio/m4a', name: 'recording.m4a' } as never);
  form.append('topic', input.topic);
  form.append('audience', input.audience);
  form.append('target_seconds', String(input.targetSeconds));
  form.append('actual_seconds', String(input.actualSeconds));
  const res = await fetch(`${API_URL}/api/v1/speaking/sessions`, {
    method: 'POST',
    headers: apiHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
