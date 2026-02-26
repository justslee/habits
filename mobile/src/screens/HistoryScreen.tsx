/**
 * Workout History & Progress Screen — TASK-P2-010
 *
 * Shows exercise history, e1RM trends, volume charts, and progression status.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import {
  getExerciseProfiles,
  getWorkoutSessions,
  ExerciseProfileData,
  WorkoutSession,
} from '../api/client';

const STATUS_COLORS: Record<string, string> = {
  progressing: '#10b981',
  maintaining: '#f59e0b',
  stalled: '#ef4444',
  deloading: '#8b5cf6',
  regressing: '#ef4444',
};

const STATUS_ICONS: Record<string, string> = {
  progressing: '📈',
  maintaining: '➡️',
  stalled: '⚠️',
  deloading: '🔄',
  regressing: '📉',
};

export default function HistoryScreen() {
  const [profiles, setProfiles] = useState<ExerciseProfileData[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        getExerciseProfiles(),
        getWorkoutSessions(20),
      ]);
      setProfiles(p);
      setSessions(s);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#666" />
      }
    >
      <Text style={styles.title}>Progress</Text>

      {/* Exercise Profiles */}
      {profiles.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Exercise Profiles</Text>
          {profiles.map((p) => (
            <View key={p.id} style={styles.profileRow}>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{p.exercise_name}</Text>
                <Text style={styles.profileMeta}>
                  {p.current_working_weight ? `${p.current_working_weight} lbs` : 'No weight'}
                  {p.estimated_1rm ? ` · e1RM ${p.estimated_1rm}` : ''}
                  {` · ${p.current_set_target || 4}×${p.current_rep_target || 5}`}
                </Text>
              </View>
              <View style={styles.profileStatus}>
                <Text style={{ fontSize: 16 }}>
                  {STATUS_ICONS[p.progression_status] || '—'}
                </Text>
                <Text
                  style={[
                    styles.statusText,
                    { color: STATUS_COLORS[p.progression_status] || '#666' },
                  ]}
                >
                  {p.progression_status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Mesocycle Info */}
      {profiles.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mesocycle</Text>
          <View style={styles.mesoRow}>
            <Text style={styles.mesoLabel}>Phase</Text>
            <Text style={styles.mesoValue}>
              {profiles[0]?.mesocycle_phase || 'accumulation'}
            </Text>
          </View>
          <View style={styles.mesoRow}>
            <Text style={styles.mesoLabel}>Week</Text>
            <Text style={styles.mesoValue}>
              {profiles[0]?.mesocycle_week || 1} / 4
            </Text>
          </View>
        </View>
      )}

      {/* Recent Sessions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Sessions</Text>
        {sessions.length === 0 ? (
          <Text style={styles.emptyText}>No sessions logged yet</Text>
        ) : (
          sessions.slice(0, 10).map((s) => (
            <View key={s.id} style={styles.sessionRow}>
              <View>
                <Text style={styles.sessionType}>
                  {s.day_type.toUpperCase()} — {s.session_date}
                </Text>
                <Text style={styles.sessionMeta}>
                  {s.exercises.length} sets · {s.status}
                  {s.overall_rpe ? ` · RPE ${s.overall_rpe}` : ''}
                </Text>
              </View>
              {s.whoop_recovery_score && (
                <Text style={styles.sessionRecovery}>
                  {s.whoop_recovery_score}%
                </Text>
              )}
            </View>
          ))
        )}
      </View>

      {profiles.length === 0 && sessions.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🏋️</Text>
          <Text style={styles.emptyTitle}>No workout data yet</Text>
          <Text style={styles.emptyText}>
            Start logging workouts from the Workout tab to see your progress here.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#000' },
  container: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 24 },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#aaa', marginBottom: 12 },

  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  profileInfo: { flex: 1 },
  profileName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  profileMeta: { color: '#666', fontSize: 12, marginTop: 2 },
  profileStatus: { alignItems: 'center' },
  statusText: { fontSize: 10, fontWeight: '600', marginTop: 2 },

  mesoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mesoLabel: { color: '#aaa', fontSize: 14 },
  mesoValue: { color: '#fff', fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },

  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  sessionType: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sessionMeta: { color: '#666', fontSize: 12, marginTop: 2 },
  sessionRecovery: { color: '#4ade80', fontSize: 14, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },
});
