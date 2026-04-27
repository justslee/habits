/**
 * WeeklyReviewScreen — AI-generated weekly board meeting.
 *
 * Shows the latest review with letter grade, pillar breakdown,
 * comfort zone analysis, recommendations, and past reviews.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, apiHeaders } from '../api/client';
import { haptic } from '../utils/haptics';
import { colors, spacing, typography, radius, fonts } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import { Skeleton, SkeletonRow } from '../components/Skeleton';

interface WeeklyReview {
  id: number;
  week_start: string;
  week_end: string;
  pillar_distribution: string;
  comfort_zone_analysis: string;
  recommendations: string;
  letter_grade: string;
  grade_justification: string;
  quote: string;
  created_at: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#10B981', B: '#3B82F6', C: '#F59E0B', D: '#EF4444', F: '#EF4444',
};

const GRADE_EMOJI: Record<string, string> = {
  A: '🔥', B: '💪', C: '😐', D: '😤', F: '💀',
};

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} — ${e.toLocaleDateString('en-US', opts)}`;
}

export default function WeeklyReviewScreen() {
  const insets = useSafeAreaInsets();
  const [latest, setLatest] = useState<WeeklyReview | null>(null);
  const [pastReviews, setPastReviews] = useState<WeeklyReview[]>([]);
  const [expandedPast, setExpandedPast] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [latestResp, listResp] = await Promise.all([
        fetch(`${API_URL}/api/v1/reviews/latest`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/v1/reviews/?limit=10`, { headers: apiHeaders() }),
      ]);
      if (latestResp.ok) {
        const data = await latestResp.json();
        setLatest(data);
      }
      if (listResp.ok) {
        const data = await listResp.json();
        // Past = everything except the latest
        setPastReviews(data.slice(1));
      }
    } catch (err) {
      console.warn('Failed to fetch reviews:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleGenerate = async () => {
    setGenerating(true);
    haptic.medium();
    try {
      const resp = await fetch(`${API_URL}/api/v1/reviews/generate`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (resp.ok) {
        haptic.success();
        await fetchData();
      }
    } catch (err) {
      console.warn('Failed to generate review:', err);
    }
    setGenerating(false);
  };

  const renderReview = (review: WeeklyReview, isLatest: boolean = false) => {
    const gradeColor = GRADE_COLORS[review.letter_grade] || colors.textTertiary;
    const gradeEmoji = GRADE_EMOJI[review.letter_grade] || '';

    return (
      <View key={review.id}>
        {/* Grade header */}
        <View style={s.gradeHeader}>
          <View style={[s.gradeBadge, { borderColor: gradeColor }]}>
            <Text style={[s.gradeText, { color: gradeColor }]}>{review.letter_grade}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={s.weekRange}>{formatWeekRange(review.week_start, review.week_end)}</Text>
            <Text style={s.gradeJustification}>{review.grade_justification}</Text>
          </View>
        </View>

        {/* Pillar Distribution */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="pie-chart-outline" size={14} color={colors.accent} />
            <Text style={s.sectionLabel}>PILLAR DISTRIBUTION</Text>
          </View>
          <Text style={s.sectionBody}>{review.pillar_distribution}</Text>
        </View>

        {/* Comfort Zone */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="warning-outline" size={14} color={colors.warning} />
            <Text style={s.sectionLabel}>COMFORT ZONE CHECK</Text>
          </View>
          <Text style={s.sectionBody}>{review.comfort_zone_analysis}</Text>
        </View>

        {/* Recommendations */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="bulb-outline" size={14} color={colors.success} />
            <Text style={s.sectionLabel}>NEXT WEEK</Text>
          </View>
          <Text style={s.sectionBody}>{review.recommendations}</Text>
        </View>

        {/* Quote */}
        <View style={s.quoteBox}>
          <Text style={s.quoteText}>"{review.quote}"</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={s.centerContainer}>
        <View style={{ width: '100%', padding: spacing.lg, gap: spacing.md }}>
          <Skeleton width="50%" height={28} />
          <Skeleton width="100%" height={200} borderRadius={radius.lg} />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView
      style={s.scroll}
      contentContainerStyle={[s.container, { paddingTop: insets.top + spacing.sm }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <Text style={s.screenTitle}>Weekly Review</Text>

      {latest ? (
        <View style={s.card}>
          {renderReview(latest, true)}
        </View>
      ) : (
        <View style={s.emptyState}>
          <Ionicons name="document-text-outline" size={48} color={colors.textTertiary} />
          <Text style={s.emptyTitle}>No reviews yet</Text>
          <Text style={s.emptySub}>Generate your first weekly review below</Text>
        </View>
      )}

      {/* Generate button */}
      <TouchableOpacity
        style={[s.generateBtn, generating && { opacity: 0.5 }]}
        onPress={handleGenerate}
        disabled={generating}
      >
        {generating ? (
          <Skeleton width={120} height={18} />
        ) : (
          <>
            <Ionicons name="sparkles-outline" size={18} color={colors.text} />
            <Text style={s.generateBtnText}>
              {latest ? 'Generate New Review' : 'Generate Weekly Review'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Past reviews */}
      {pastReviews.length > 0 && (
        <>
          <Text style={s.pastTitle}>Past Reviews</Text>
          {pastReviews.map(review => {
            const isExpanded = expandedPast === review.id;
            const gradeColor = GRADE_COLORS[review.letter_grade] || colors.textTertiary;
            return (
              <TouchableOpacity
                key={review.id}
                style={s.pastCard}
                onPress={() => {
                  haptic.light();
                  setExpandedPast(isExpanded ? null : review.id);
                }}
                activeOpacity={0.7}
              >
                <View style={s.pastHeader}>
                  <Text style={[s.pastGrade, { color: gradeColor }]}>{review.letter_grade}</Text>
                  <Text style={s.pastWeek}>{formatWeekRange(review.week_start, review.week_end)}</Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16} color={colors.textTertiary}
                  />
                </View>
                {isExpanded && (
                  <View style={{ marginTop: spacing.md }}>
                    {renderReview(review)}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: spacing.lg },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  screenTitle: { fontFamily: fonts.serifItalic, fontSize: 30, color: colors.text, letterSpacing: -0.6, marginBottom: spacing.lg },

  // === Main card ===
  card: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  gradeHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  gradeBadge: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  gradeText: { fontSize: 28, fontWeight: '800' },
  weekRange: { ...typography.caption, color: colors.textTertiary, marginBottom: 4 },
  gradeJustification: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },

  // === Sections ===
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.8 },
  sectionBody: { ...typography.body, color: colors.text, fontSize: 14, lineHeight: 20 },

  // === Quote ===
  quoteBox: {
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  quoteText: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic', fontSize: 13 },

  // === Generate button ===
  generateBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg,
    flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
  },
  generateBtnText: { ...typography.bodyBold, color: colors.text },

  // === Empty state ===
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { ...typography.bodyBold, color: colors.text, marginTop: spacing.md },
  emptySub: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },

  // === Past reviews ===
  pastTitle: {
    ...typography.bodyBold, color: colors.textTertiary, textTransform: 'uppercase',
    marginTop: spacing.xl, marginBottom: spacing.md, fontSize: 12, letterSpacing: 0.5,
  },
  pastCard: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pastHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pastGrade: { fontSize: 20, fontWeight: '800' },
  pastWeek: { ...typography.body, color: colors.textSecondary, flex: 1, fontSize: 14 },
});
