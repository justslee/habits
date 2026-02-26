import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getExerciseProfiles, getWorkoutSessions, ExerciseProfileData, WorkoutSession } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';

const STATUS_COLORS: Record<string, string> = {
  progressing: colors.success,
  maintaining: colors.warning,
  stalled: colors.error,
  deloading: '#bf5af2',
  regressing: colors.error,
};

const STATUS_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  progressing: 'arrow-up',
  maintaining: 'arrow-forward',
  stalled: 'alert-circle',
  deloading: 'refresh',
  regressing: 'arrow-down',
};

export default function HistoryScreen() {
  const [profiles, setProfiles] = useState<ExerciseProfileData[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([getExerciseProfiles(), getWorkoutSessions(20)]);
      setProfiles(p); setSessions(s);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.textTertiary} />}>

      <Text style={s.screenTitle}>Progress</Text>

      {profiles.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>EXERCISE PROFILES</Text>
          {profiles.map((p, i) => (
            <View key={p.id} style={[s.profileRow, i < profiles.length - 1 && s.divider]}>
              <View style={s.profileInfo}>
                <Text style={s.profileName}>{p.exercise_name}</Text>
                <Text style={s.profileMeta}>
                  {p.current_working_weight ? `${p.current_working_weight} lb` : 'No weight'}
                  {p.estimated_1rm ? `  ·  e1RM ${p.estimated_1rm}` : ''}
                  {`  ·  ${p.current_set_target || 4}x${p.current_rep_target || 5}`}
                </Text>
              </View>
              <View style={[s.statusPill, { backgroundColor: (STATUS_COLORS[p.progression_status] || colors.textTertiary) + '1a' }]}>
                <Ionicons name={STATUS_ICONS[p.progression_status] || 'ellipse'} size={12}
                  color={STATUS_COLORS[p.progression_status] || colors.textTertiary} />
                <Text style={[s.statusText, { color: STATUS_COLORS[p.progression_status] || colors.textTertiary }]}>
                  {p.progression_status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {profiles.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>MESOCYCLE</Text>
          <View style={s.mesoRow}>
            <Text style={s.mesoLabel}>Phase</Text>
            <Text style={s.mesoValue}>{profiles[0]?.mesocycle_phase || 'accumulation'}</Text>
          </View>
          <View style={s.mesoRow}>
            <Text style={s.mesoLabel}>Week</Text>
            <Text style={s.mesoValue}>{profiles[0]?.mesocycle_week || 1} / 4</Text>
          </View>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardLabel}>RECENT SESSIONS</Text>
        {sessions.length === 0 ? (
          <Text style={s.emptyText}>No sessions logged yet</Text>
        ) : (
          sessions.slice(0, 10).map((sess, i) => (
            <View key={sess.id} style={[s.sessionRow, i < Math.min(sessions.length, 10) - 1 && s.divider]}>
              <View>
                <Text style={s.sessionType}>{sess.day_type.toUpperCase()}</Text>
                <Text style={s.sessionMeta}>
                  {sess.session_date}  ·  {sess.exercises.length} sets  ·  {sess.status}
                  {sess.overall_rpe ? `  ·  RPE ${sess.overall_rpe}` : ''}
                </Text>
              </View>
              {sess.whoop_recovery_score && (
                <Text style={s.sessionRecovery}>{sess.whoop_recovery_score}%</Text>
              )}
            </View>
          ))
        )}
      </View>

      {profiles.length === 0 && sessions.length === 0 && (
        <View style={s.emptyContainer}>
          <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
          <Text style={s.emptyTitle}>No workout data yet</Text>
          <Text style={s.emptyText}>Start logging from the Workout tab</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: Platform.OS === 'ios' ? 64 : 44, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...typography.largeTitle, color: colors.text, marginBottom: spacing.lg },

  card: {
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  cardLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', letterSpacing: 0.5, marginBottom: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder, paddingBottom: spacing.md, marginBottom: spacing.md },

  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileInfo: { flex: 1, marginRight: spacing.md },
  profileName: { color: colors.text, ...typography.subhead, fontWeight: '600' },
  profileMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
  },
  statusText: { ...typography.caption2, fontWeight: '600', textTransform: 'capitalize' },

  mesoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  mesoLabel: { ...typography.subhead, color: colors.textSecondary },
  mesoValue: { ...typography.subhead, color: colors.text, fontWeight: '600', textTransform: 'capitalize' },

  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionType: { color: colors.text, ...typography.subhead, fontWeight: '600' },
  sessionMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  sessionRecovery: { ...typography.subhead, color: colors.success, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', paddingVertical: 48, gap: spacing.sm },
  emptyTitle: { ...typography.headline, color: colors.text },
  emptyText: { ...typography.subhead, color: colors.textTertiary, textAlign: 'center' },
});
