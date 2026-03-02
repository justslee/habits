/**
 * WhoopCard — Rich Whoop data display inspired by Whoop/Apple Fitness+.
 *
 * Shows: Recovery score (hero), strain, sleep stages, HR zones, key vitals.
 * Compact mode for embedding in workout screen, full mode for standalone.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WhoopData } from '../api/client';
import { colors, spacing, typography, radius, cardStyle } from '../theme';

interface Props {
  data: WhoopData;
  compact?: boolean; // Compact = just recovery + key stats. Full = everything.
}

// Recovery color (Whoop green/yellow/red)
function recoveryColor(score: number | null): string {
  if (score == null) return colors.textTertiary;
  if (score >= 67) return '#00C853';  // Whoop green
  if (score >= 34) return '#FFB300';  // Whoop yellow
  return '#FF3D00';                    // Whoop red
}

function strainColor(strain: number | null): string {
  if (strain == null) return colors.textTertiary;
  if (strain >= 18) return '#FF3D00';
  if (strain >= 14) return '#FFB300';
  if (strain >= 8) return '#2196F3';
  return '#00C853';
}

// HR zone colors (matching Whoop's zone palette)
const ZONE_COLORS = ['#9E9E9E', '#2196F3', '#4CAF50', '#FFB300', '#FF9800', '#FF3D00'];
const ZONE_LABELS = ['Rest', 'Light', 'Moderate', 'Vigorous', 'Peak', 'Max'];

function formatMinutes(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function WhoopCard({ data, compact = false }: Props) {
  const recColor = recoveryColor(data.recovery_score);
  const strColor = strainColor(data.strain_score);

  return (
    <View style={s.container}>
      {/* Recovery Hero */}
      <View style={s.heroRow}>
        <View style={s.heroLeft}>
          <View style={[s.recoveryRing, { borderColor: recColor }]}>
            <Text style={[s.recoveryNumber, { color: recColor }]}>
              {data.recovery_score != null ? Math.round(data.recovery_score) : '—'}
            </Text>
            <Text style={s.recoveryPercent}>%</Text>
          </View>
          <Text style={[s.recoveryLabel, { color: recColor }]}>RECOVERY</Text>
        </View>

        <View style={s.heroRight}>
          <View style={s.heroStat}>
            <Text style={s.heroStatValue}>{data.hrv != null ? Math.round(data.hrv) : '—'}</Text>
            <Text style={s.heroStatLabel}>HRV</Text>
          </View>
          <View style={s.heroStat}>
            <Text style={s.heroStatValue}>{data.resting_hr != null ? Math.round(data.resting_hr) : '—'}</Text>
            <Text style={s.heroStatLabel}>RHR</Text>
          </View>
          <View style={s.heroStat}>
            <Text style={[s.heroStatValue, { color: strColor }]}>
              {data.strain_score != null ? data.strain_score.toFixed(1) : '—'}
            </Text>
            <Text style={s.heroStatLabel}>STRAIN</Text>
          </View>
        </View>
      </View>

      {/* Recovery bar */}
      <View style={s.barTrack}>
        <View style={[s.barFill, {
          width: `${data.recovery_score ?? 0}%`,
          backgroundColor: recColor,
        }]} />
      </View>

      {/* Vitals row */}
      <View style={s.vitalsRow}>
        {data.spo2 != null && (
          <View style={s.vitalItem}>
            <Text style={s.vitalValue}>{data.spo2.toFixed(1)}%</Text>
            <Text style={s.vitalLabel}>SpO2</Text>
          </View>
        )}
        {data.skin_temp_celsius != null && (
          <View style={s.vitalItem}>
            <Text style={s.vitalValue}>{((data.skin_temp_celsius * 9/5) + 32).toFixed(1)}°</Text>
            <Text style={s.vitalLabel}>Skin Temp</Text>
          </View>
        )}
        {data.respiratory_rate != null && (
          <View style={s.vitalItem}>
            <Text style={s.vitalValue}>{data.respiratory_rate.toFixed(1)}</Text>
            <Text style={s.vitalLabel}>Resp Rate</Text>
          </View>
        )}
        {data.calories != null && (
          <View style={s.vitalItem}>
            <Text style={s.vitalValue}>{data.calories.toLocaleString()}</Text>
            <Text style={s.vitalLabel}>Cal</Text>
          </View>
        )}
      </View>

      {!compact && (
        <>
          {/* Sleep Section */}
          {data.total_sleep_minutes != null && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Ionicons name="moon-outline" size={14} color={colors.accent} />
                <Text style={s.sectionTitle}>SLEEP</Text>
                <Text style={[s.sectionValue, { color: data.sleep_score != null && data.sleep_score >= 85 ? '#00C853' : data.sleep_score != null && data.sleep_score >= 70 ? '#FFB300' : colors.text }]}>
                  {data.sleep_score != null ? `${Math.round(data.sleep_score)}%` : '—'}
                </Text>
              </View>

              {/* Sleep duration */}
              <Text style={s.sleepDuration}>{formatMinutes(data.total_sleep_minutes)}</Text>
              {data.sleep_needed_minutes != null && (
                <Text style={s.sleepNeeded}>
                  of {formatMinutes(data.sleep_needed_minutes)} needed
                  {data.sleep_debt_minutes != null && data.sleep_debt_minutes > 0 ? ` · ${formatMinutes(data.sleep_debt_minutes)} debt` : ''}
                </Text>
              )}

              {/* Sleep stages bar */}
              <View style={s.sleepBar}>
                {[
                  { min: data.deep_sleep_minutes, color: '#1A237E', label: 'Deep' },
                  { min: data.rem_minutes, color: '#00BCD4', label: 'REM' },
                  { min: data.light_sleep_minutes, color: '#7986CB', label: 'Light' },
                  { min: data.awake_minutes, color: '#FF8A65', label: 'Awake' },
                ].map((stage, i) => {
                  if (!stage.min || !data.total_sleep_minutes) return null;
                  const totalWithAwake = (data.total_sleep_minutes || 0) + (data.awake_minutes || 0);
                  const pct = (stage.min / totalWithAwake) * 100;
                  return (
                    <View key={i} style={[s.sleepBarSegment, {
                      width: `${pct}%`, backgroundColor: stage.color,
                    }]} />
                  );
                })}
              </View>

              {/* Sleep stage legend */}
              <View style={s.sleepLegend}>
                {[
                  { min: data.deep_sleep_minutes, color: '#1A237E', label: 'Deep' },
                  { min: data.rem_minutes, color: '#00BCD4', label: 'REM' },
                  { min: data.light_sleep_minutes, color: '#7986CB', label: 'Light' },
                  { min: data.awake_minutes, color: '#FF8A65', label: 'Awake' },
                ].map((stage, i) => (
                  <View key={i} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: stage.color }]} />
                    <Text style={s.legendLabel}>{stage.label}</Text>
                    <Text style={s.legendValue}>{formatMinutes(stage.min)}</Text>
                  </View>
                ))}
              </View>

              {/* Extra sleep stats */}
              <View style={s.sleepStats}>
                {data.sleep_consistency != null && (
                  <View style={s.vitalItem}>
                    <Text style={s.vitalValue}>{Math.round(data.sleep_consistency)}%</Text>
                    <Text style={s.vitalLabel}>Consistency</Text>
                  </View>
                )}
                {data.sleep_efficiency != null && (
                  <View style={s.vitalItem}>
                    <Text style={s.vitalValue}>{Math.round(data.sleep_efficiency)}%</Text>
                    <Text style={s.vitalLabel}>Efficiency</Text>
                  </View>
                )}
                {data.sleep_cycles != null && (
                  <View style={s.vitalItem}>
                    <Text style={s.vitalValue}>{data.sleep_cycles}</Text>
                    <Text style={s.vitalLabel}>Cycles</Text>
                  </View>
                )}
                {data.disturbances != null && (
                  <View style={s.vitalItem}>
                    <Text style={s.vitalValue}>{data.disturbances}</Text>
                    <Text style={s.vitalLabel}>Disturbances</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Latest Workout + HR Zones */}
          {data.workout_strain != null && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Ionicons name="flame-outline" size={14} color='#FF9800' />
                <Text style={s.sectionTitle}>LATEST ACTIVITY</Text>
                <Text style={s.sectionValue}>
                  {(data.workout_sport || 'workout').charAt(0).toUpperCase() + (data.workout_sport || 'workout').slice(1)}
                </Text>
              </View>

              {/* Workout stats */}
              <View style={s.workoutStats}>
                <View style={s.vitalItem}>
                  <Text style={[s.vitalValue, { color: strainColor(data.workout_strain) }]}>
                    {data.workout_strain.toFixed(1)}
                  </Text>
                  <Text style={s.vitalLabel}>Strain</Text>
                </View>
                {data.workout_duration_minutes != null && (
                  <View style={s.vitalItem}>
                    <Text style={s.vitalValue}>{data.workout_duration_minutes}m</Text>
                    <Text style={s.vitalLabel}>Duration</Text>
                  </View>
                )}
                <View style={s.vitalItem}>
                  <Text style={s.vitalValue}>{data.workout_avg_hr ?? '—'}</Text>
                  <Text style={s.vitalLabel}>Avg HR</Text>
                </View>
                <View style={s.vitalItem}>
                  <Text style={s.vitalValue}>{data.workout_max_hr ?? '—'}</Text>
                  <Text style={s.vitalLabel}>Max HR</Text>
                </View>
                {data.workout_calories != null && (
                  <View style={s.vitalItem}>
                    <Text style={s.vitalValue}>{data.workout_calories}</Text>
                    <Text style={s.vitalLabel}>Cal</Text>
                  </View>
                )}
              </View>

              {/* HR Zone Bar */}
              {data.workout_hr_zones && (
                <View style={s.zoneSection}>
                  <Text style={s.zoneTitle}>HR ZONES</Text>
                  <View style={s.zoneBar}>
                    {Object.entries(data.workout_hr_zones).map(([key, val], i) => {
                      const total = Object.values(data.workout_hr_zones!).reduce((a, b) => a + b, 0);
                      if (total === 0 || val === 0) return null;
                      return (
                        <View key={key} style={[s.zoneBarSegment, {
                          flex: val, backgroundColor: ZONE_COLORS[i],
                        }]} />
                      );
                    })}
                  </View>
                  <View style={s.zoneLegend}>
                    {Object.entries(data.workout_hr_zones).map(([key, val], i) => {
                      if (val === 0) return null;
                      return (
                        <View key={key} style={s.zoneLegendItem}>
                          <View style={[s.legendDot, { backgroundColor: ZONE_COLORS[i] }]} />
                          <Text style={s.legendLabel}>{ZONE_LABELS[i]}</Text>
                          <Text style={s.legendValue}>{val.toFixed(0)}m</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { ...cardStyle, marginBottom: spacing.md },

  // Hero
  heroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  heroLeft: { alignItems: 'center', marginRight: spacing.lg },
  recoveryRing: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  recoveryNumber: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recoveryPercent: { ...typography.micro, color: colors.textTertiary, marginTop: -4 },
  recoveryLabel: { ...typography.micro, fontWeight: '700', marginTop: 4, letterSpacing: 1 },

  heroRight: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  heroStat: { alignItems: 'center' },
  heroStatValue: { ...typography.title3, color: colors.text, fontVariant: ['tabular-nums'] },
  heroStatLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },

  // Bar
  barTrack: { height: 4, backgroundColor: colors.input, borderRadius: 2, marginBottom: spacing.md },
  barFill: { height: 4, borderRadius: 2 },

  // Vitals
  vitalsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm },
  vitalItem: { alignItems: 'center', minWidth: 50 },
  vitalValue: { ...typography.caption, color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  vitalLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 1 },

  // Sections
  section: {
    paddingTop: spacing.md, marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { ...typography.micro, color: colors.textTertiary, letterSpacing: 1, flex: 1 },
  sectionValue: { ...typography.caption, color: colors.text, fontWeight: '700' },

  // Sleep
  sleepDuration: { ...typography.title2, color: colors.text, marginBottom: 2 },
  sleepNeeded: { ...typography.micro, color: colors.textTertiary, marginBottom: spacing.md },
  sleepBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: spacing.sm },
  sleepBarSegment: { height: 10 },
  sleepLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  sleepStats: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: spacing.sm },

  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...typography.micro, color: colors.textTertiary },
  legendValue: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },

  // Workout
  workoutStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.md },

  // HR Zones
  zoneSection: { marginTop: spacing.sm },
  zoneTitle: { ...typography.micro, color: colors.textTertiary, letterSpacing: 1, marginBottom: spacing.xs },
  zoneBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: spacing.sm },
  zoneBarSegment: { height: 10 },
  zoneLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  zoneLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
