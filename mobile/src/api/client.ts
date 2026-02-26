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
