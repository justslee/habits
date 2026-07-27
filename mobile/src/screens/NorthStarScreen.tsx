/**
 * NorthStarScreen — Vision · Discipline · Compound.
 *
 * Direct port of `NorthStarTab` from `northstar.jsx` in the design canvas.
 *
 * Vision panel    — NSHero (mantra + GROWTH/STREAK/DEEP grid) → Pillar quartet
 *                   → Pillar targets → Anti-goals
 * Discipline      — live discipline/consistency data
 * Compound        — InteractiveCompoundChart + activity tiles + recent
 *
 * Backend wiring: getVision (mantra + targets + anti-goals), getDashboardStats
 * (hours + streaks + pillar progress).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Dimensions,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getVision, getDashboardStats, getHeatmap, getRecentEntries,
  VisionData, DashboardStats, HeatmapDay, EntryResponse,
  API_URL, apiHeaders,
} from '../api/client';
import { colors, fonts, radius, spacing, PILLAR_COLORS } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import NSBrandHeader from '../components/NSBrandHeader';
import InteractiveCompoundChart from '../components/InteractiveCompoundChart';
import NSCompoundChart from '../components/NSCompoundChart';
import BloomGrid from '../components/BloomGrid';
import { haptic } from '../utils/haptics';

type Sub = 'vision' | 'discipline' | 'compound';

const SUB_TABS: Array<{ k: Sub; l: string; i: string }> = [
  { k: 'vision',     l: 'Vision',     i: '★' },
  { k: 'discipline', l: 'Discipline', i: '✓' },
  { k: 'compound',   l: 'Compound',   i: '✦' },
];

interface PillarRow {
  /** DB id 1-5. */
  id: number;
  /** Display name. */
  k: string;
  /** Mono short label. */
  short: string;
  /** Subline. */
  sub: string;
  /** Right column small label (PHD / RESEARCH / etc). */
  target_label: string;
  /** Mastery level. */
  level: number;
  /** Progress 0..1. */
  pct: number;
  /** Lifetime hours. */
  hours: number;
  /** Color. */
  color: string;
  /** Vision target sentence. */
  target: string;
}

// Mirrors NS_PILLARS in northstar.jsx — but each row is hydrated with the live
// pillar-stats hours/level if available, and target text from vision payload.
const FALLBACK_PILLARS: PillarRow[] = [
  { id: 1, k: 'Quant',   short: 'QUANT FINANCE', sub: 'Stochastic · Pricing · Vol surfaces', target_label: 'PHD / CQF',  level: 4, pct: 0.74, hours: 312, color: PILLAR_COLORS[1], target: 'PhD-level fluency in stochastic calculus, derivatives pricing, and statistical arb. Trade my own book.' },
  { id: 2, k: 'Macro',   short: 'MACRO',         sub: 'Policy · Geopolitics · Narrative',    target_label: 'ELITE GEN',  level: 3, pct: 0.58, hours: 184, color: PILLAR_COLORS[2], target: 'Read the world like a top-tier macro PM. Rates, FX, commodities — connect them in real time.' },
  { id: 3, k: 'ML Math', short: 'ML · MATH',     sub: 'Linear alg · Optim · Bayes',          target_label: 'RESEARCH',   level: 5, pct: 0.81, hours: 388, color: PILLAR_COLORS[3], target: 'Research-level grasp of statistical learning theory. Read NeurIPS papers without skimming.' },
  { id: 4, k: 'AI Eng',  short: 'AI ENG',        sub: 'MLOps · Inference · Agents',          target_label: 'PRODUCTION', level: 4, pct: 0.69, hours: 264, color: PILLAR_COLORS[4], target: 'Ship production-grade AI systems end-to-end. From data to deploy to drift detection.' },
  { id: 5, k: 'Speaking',short: 'SPEAKING',      sub: 'Story · Pitch · Presence',            target_label: 'KEYNOTE',    level: 3, pct: 0.55, hours: 96,  color: PILLAR_COLORS[5], target: 'Keynote-caliber delivery. Persuade rooms. Teach hard ideas to non-experts in plain language.' },
];

// ── DisciplinePanel — live habit completion + streaks + 30-day perfect grid + 90-day heatmap.
// Direct port of `DisciplineTab` from discipline-tab.jsx in the design canvas.

interface DPHabit {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  completed_today: boolean;
}

function DisciplinePanel({
  habits, heatmap, currentStreak, longestStreak, onWeeklyReview,
}: {
  habits: DPHabit[];
  heatmap: HeatmapDay[];
  currentStreak: number;
  longestStreak: number;
  onWeeklyReview: () => void;
}) {
  const kept = habits.filter(h => h.completed_today).length;
  const total = habits.length;
  const pct = total ? Math.round((kept / total) * 100) : 0;
  const grade =
    pct >= 95 ? 'A+' : pct >= 90 ? 'A' : pct >= 80 ? 'B' :
    pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
  const tone =
    pct >= 90 ? colors.recoveryGreen :
    pct >= 70 ? colors.accent : colors.error;

  // 30-day perfect dots (from heatmap entry-counts as a proxy for activity intensity)
  const days30 = (() => {
    const last30 = heatmap.slice(-30);
    if (last30.length === 0) {
      return Array.from({ length: 30 }, () => 0);
    }
    return last30.map(d => {
      const c = d.count ?? 0;
      if (c === 0) return 0;
      if (c === 1) return 35;
      if (c === 2) return 60;
      if (c === 3) return 78;
      if (c >= 4) return 100;
      return 0;
    });
  })();

  // 90-day heatmap
  const days90 = (() => {
    const last90 = heatmap.slice(-91);
    if (last90.length === 0) return Array.from({ length: 91 }, () => 0);
    return last90.map(d => {
      const c = d.count ?? 0;
      if (c === 0) return 0;
      if (c === 1) return 35;
      if (c === 2) return 60;
      if (c === 3) return 78;
      if (c >= 4) return 100;
      return 0;
    });
  })();

  // Cell sizing for dot/heat grids — measure container width so cells actually paint.
  // Container is page (16+16) + subCard padding (16+16) inset.
  const screenW = Dimensions.get('window').width;
  const gridW = screenW - 64;
  const dotCols = 15;
  const dotGap = 4;
  const dotSize = Math.floor((gridW - dotGap * (dotCols - 1)) / dotCols);
  const heatCols = 13;
  const heatGap = 3;
  const heatSize = Math.floor((gridW - heatGap * (heatCols - 1)) / heatCols);

  const perfectCount = days30.filter(p => p >= 100).length;
  const brokenCount = days30.filter(p => p === 0).length;
  const avgPct = days90.length ? Math.round(days90.reduce((s, v) => s + v, 0) / days90.length) : 0;

  const coachLine = pct >= 90
    ? 'You are exactly the person you said you were going to be today. Sleep early so tomorrow has the same shape.'
    : pct >= 60
    ? 'A couple unfinished. Knock one out before dinner — you\'ll thank yourself tomorrow morning.'
    : 'The plan got loose. Don\'t chase perfection — just one habit, right now.';

  const heroTone = pct >= 90 ? 'Almost a perfect day. Keep the chain alive — sleep on time.'
    : pct >= 75 ? 'Solid. The slips were small. Note them, don\'t spiral.'
    : pct >= 50 ? 'Half-built. One more habit before bed flips the day.'
    : 'You felt this one. Pick one to anchor tomorrow morning.';

  return (
    <>
      {/* Hero — letter grade + count + serif tone line + 3 chips */}
      <View style={dStyles.heroCard}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={[dStyles.grade, { color: tone }]}>{grade}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={dStyles.gradeCount}>
              {kept}<Text style={dStyles.gradeCountTotal}>/{total}</Text>
            </Text>
            <Text style={dStyles.gradeLabel}>HABITS · {pct}%</Text>
          </View>
        </View>
        <Text style={dStyles.heroTone}>{heroTone}</Text>
        <View style={dStyles.chipRow}>
          <DPChip label="🔥 STREAK" value={`${currentStreak}d`} accent />
          <DPChip label="BEST" value={`${longestStreak || 0}d`} />
          <DPChip label="LONGEST ACTIVE" value={`${longestStreak || 0}d`} />
        </View>
      </View>

      {/* Perfect dots — last 30 days */}
      <View style={dStyles.subCard}>
        <View style={dStyles.subCardHead}>
          <Text style={dStyles.eyebrow}>LAST 30 DAYS</Text>
          <Text style={dStyles.eyebrow}>{perfectCount} PERFECT · {brokenCount} BROKEN</Text>
        </View>
        <View style={dStyles.dotGrid}>
          {days30.map((p, i) => (
            <View
              key={i}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: 4,
                marginRight: (i + 1) % dotCols === 0 ? 0 : dotGap,
                marginBottom: dotGap,
                backgroundColor:
                  p >= 100 ? colors.recoveryGreen :
                  p >= 80  ? colors.accent :
                  p >= 50  ? 'rgba(155,138,232,0.4)' :
                  p > 0    ? 'rgba(125,125,125,0.4)' :
                             'rgba(80,40,40,0.5)',
                borderWidth: i === days30.length - 1 ? 1.5 : 0,
                borderColor: colors.text,
              }}
            />
          ))}
        </View>
        <View style={dStyles.legendRow}>
          {[
            { c: colors.recoveryGreen, l: 'PERFECT' },
            { c: colors.accent, l: '≥ 80%' },
            { c: 'rgba(155,138,232,0.4)', l: '≥ 50%' },
            { c: 'rgba(80,40,40,0.5)', l: 'BROKEN' },
          ].map(({ c, l }) => (
            <View key={l} style={dStyles.legendItem}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
              <Text style={dStyles.legendLabel}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* By-habit adherence */}
      {habits.length > 0 && (
        <View style={dStyles.subCard}>
          <View style={dStyles.subCardHead}>
            <Text style={dStyles.eyebrow}>BY HABIT · TODAY</Text>
            <Text style={dStyles.eyebrow}>FROM DAILY DASHBOARD</Text>
          </View>
          {habits.map((h, i) => {
            const habitColor = h.color || colors.accent;
            const initial = (h.name || '?').charAt(0).toUpperCase();
            return (
              <View key={h.id} style={[dStyles.habitRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={[
                  dStyles.habitGlyph,
                  {
                    backgroundColor: h.completed_today ? habitColor : 'rgba(15,15,24,0.6)',
                    borderColor: h.completed_today ? habitColor : 'rgba(64,64,80,0.6)',
                  },
                ]}>
                  <Text style={[
                    dStyles.habitGlyphText,
                    { color: h.completed_today ? colors.bg : colors.textTertiary },
                  ]}>{initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[
                    dStyles.habitName,
                    { color: h.completed_today ? colors.text : colors.textSecondary },
                  ]}>{h.name}</Text>
                  <Text style={dStyles.habitMeta}>
                    {h.completed_today ? '✓ DONE TODAY' : '· PENDING'} · DAILY
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[
                    dStyles.habitStreak,
                    { color: h.current_streak > 0 ? colors.accent : colors.textTertiary },
                  ]}>
                    {h.current_streak > 0 ? `${h.current_streak}d` : '—'}
                  </Text>
                  <Text style={dStyles.habitStreakLabel}>STREAK</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* 90-day completion heatmap */}
      <View style={dStyles.subCard}>
        <View style={dStyles.subCardHead}>
          <Text style={dStyles.eyebrow}>90 DAYS · COMPLETION</Text>
          <Text style={dStyles.eyebrow}>{avgPct}% AVG</Text>
        </View>
        <View style={dStyles.heatGrid}>
          {days90.map((p, i) => (
            <View
              key={i}
              style={{
                width: heatSize,
                height: heatSize,
                borderRadius: 3,
                marginRight: (i + 1) % heatCols === 0 ? 0 : heatGap,
                marginBottom: heatGap,
                backgroundColor:
                  p >= 100 ? colors.recoveryGreen :
                  p >= 80  ? colors.accent :
                  p >= 50  ? 'rgba(155,138,232,0.45)' :
                  p > 0    ? 'rgba(125,125,125,0.4)' :
                             colors.surface2,
              }}
            />
          ))}
        </View>
      </View>

      {/* Coach nudge */}
      <View style={dStyles.coachCard}>
        <View style={dStyles.coachAvatar}><Text style={dStyles.coachAvatarText}>C</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={dStyles.coachEyebrow}>COACH · NUDGE</Text>
          <Text style={dStyles.coachLine}>{coachLine}</Text>
        </View>
      </View>

      <TouchableOpacity onPress={onWeeklyReview} style={dStyles.reviewBtn}>
        <Text style={dStyles.reviewBtnText}>OPEN WEEKLY REVIEW ›</Text>
      </TouchableOpacity>
    </>
  );
}

function DPChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={dStyles.chip}>
      <Text style={dStyles.chipLabel}>{label}</Text>
      <Text style={[dStyles.chipValue, { color: accent ? colors.accent : colors.text }]}>{value}</Text>
    </View>
  );
}

function PillarCard({
  pillar: p, fullSpan, onPress,
}: {
  pillar: PillarRow; fullSpan: boolean; onPress: () => void;
}) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.pillarCard, fullSpan && { width: '100%' }]}
    >
      <View style={styles.pillarRingBox}>
        <Svg width={50} height={50} viewBox="0 0 50 50" style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={25} cy={25} r={r} fill="none" stroke={colors.line} strokeWidth={2.5} />
          <Circle
            cx={25}
            cy={25}
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - p.pct * c}
          />
        </Svg>
        <View style={styles.pillarLvlOverlay}>
          <Text style={[styles.pillarLvl, { color: p.color }]}>L{p.level}</Text>
        </View>
      </View>
      <Text style={[styles.pillarShort, { color: p.color }]}>{p.short}</Text>
      <Text style={styles.pillarPct}>
        {Math.round(p.pct * 100)}
        <Text style={styles.pillarPctUnit}>%</Text>
      </Text>
      <Text style={styles.pillarSub}>{p.sub}</Text>
      <View style={styles.pillarFoot}>
        <Text style={styles.pillarFootText}>{p.hours}h · {p.target_label}</Text>
        <Text style={[styles.pillarFootDelta, { color: colors.recoveryGreen }]}>↑ +0.2</Text>
      </View>
    </TouchableOpacity>
  );
}


export default function NorthStarScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [sub, setSub] = useState<Sub>('vision');
  const [vision, setVision] = useState<VisionData | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [recentEntries, setRecentEntries] = useState<EntryResponse[]>([]);
  const [habits, setHabits] = useState<Array<{ id: number; name: string; color: string | null; icon: string | null; current_streak: number; longest_streak: number; total_completions: number; completed_today: boolean }>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const [v, s, h, e, daily] = await Promise.allSettled([
      getVision(),
      getDashboardStats(),
      getHeatmap(180),
      getRecentEntries(7),
      fetch(`${API_URL}/api/v1/daily/summary`, { headers: apiHeaders() }).then(r => r.ok ? r.json() : null),
    ]);
    if (v.status === 'fulfilled') setVision(v.value);
    if (s.status === 'fulfilled') setStats(s.value);
    if (h.status === 'fulfilled') setHeatmap(h.value);
    if (e.status === 'fulfilled') setRecentEntries(e.value);
    if (daily.status === 'fulfilled' && daily.value?.habits) setHabits(daily.value.habits);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Hydrate pillar rows from live stats where available
  const pillars: PillarRow[] = FALLBACK_PILLARS.map(p => {
    const live = stats?.pillar_breakdown?.find(pb => pb.pillar_id === p.id);
    if (!live) return p;
    return {
      ...p,
      hours: Math.round(live.total_hours ?? p.hours),
      pct: live.avg_depth_score != null ? Math.min(1, live.avg_depth_score / 100) : p.pct,
      target: vision?.pillar_targets?.[String(p.id)] ?? p.target,
    };
  });

  const subtitle = sub === 'vision'    ? "Where you're going · why it matters"
                 : sub === 'compound'  ? 'Are you actually compounding?'
                                       : 'Did you keep your word today?';

  const longestStreak = stats?.streaks?.length
    ? Math.max(...stats.streaks.map(s => s.longest_streak ?? 0))
    : 0;
  const currentStreak = stats?.streaks?.length
    ? Math.max(...stats.streaks.map(s => s.current_streak ?? 0))
    : 0;
  const lifetimeHours = Math.round(stats?.hours?.all_time ?? 0);
  const day = Math.max(1, currentStreak || lifetimeHours);

  // Growth multiplier — same heuristic as DailyScreen
  const growthMult = (() => {
    const base = Math.pow(1.011, day);
    return base.toFixed(base < 10 ? 2 : 1);
  })();

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={colors.accent}
          />
        }
      >
        {/* Flush with top — header gradient bleeds up under the status bar */}
        <NSBrandHeader subtitle={subtitle} insetsTop={insets.top} />

        {/* Sub-tab pill bar */}
        <View style={styles.subTabBar}>
          {SUB_TABS.map(t => {
            const active = sub === t.k;
            return (
              <TouchableOpacity
                key={t.k}
                onPress={() => { setSub(t.k); haptic.selection(); }}
                activeOpacity={0.85}
                style={[styles.subTabBtn, active && styles.subTabBtnActive]}
              >
                <Text style={[styles.subTabIcon, active && { color: colors.accent }]}>{t.i}</Text>
                <Text style={[styles.subTabText, active && { color: colors.accent }]}>{t.l.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {sub === 'vision' && (
          <>
            {/* NSHero — mantra + GROWTH/STREAK/DEEP grid */}
            <View style={styles.heroCard}>
              <View style={styles.dayPill}><Text style={styles.dayPillText}>DAY · {String(day).padStart(3, '0')}</Text></View>
              <Text style={styles.heroEyebrow}>NORTH STAR</Text>
              <Text style={styles.heroLine}>
                {vision?.vision_text || (
                  <>Become someone who has compounded for so long that <Text style={{ color: colors.accent }}>ten years from today</Text> the difference is undeniable — to me first, and the world second.</>
                )}
              </Text>
              <View style={styles.heroStats}>
                <View style={styles.heroStatCell}>
                  <Text style={styles.heroStatLabel}>GROWTH</Text>
                  <Text style={styles.heroStatVal}>
                    {growthMult}
                    <Text style={styles.heroStatUnit}>×</Text>
                  </Text>
                  <Text style={[styles.heroStatDelta, { color: colors.recoveryGreen }]}>↗ +0.18 · 7d</Text>
                </View>
                <View style={styles.heroStatCell}>
                  <Text style={styles.heroStatLabel}>STREAK</Text>
                  <Text style={styles.heroStatVal}>
                    {currentStreak}
                    <Text style={styles.heroStatUnit}>d</Text>
                  </Text>
                  <Text style={styles.heroStatMeta}>BEST · {longestStreak}</Text>
                </View>
                <View style={styles.heroStatCell}>
                  <Text style={styles.heroStatLabel}>DEEP</Text>
                  <Text style={styles.heroStatVal}>
                    {lifetimeHours}
                    <Text style={styles.heroStatUnit}>h</Text>
                  </Text>
                  <Text style={styles.heroStatMeta}>LIFETIME</Text>
                </View>
              </View>
            </View>

            {/* Pillars section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pillars</Text>
              <Text style={styles.sectionMore}>TAP TO DRILL</Text>
            </View>
            <View style={styles.pillarGrid}>
              {pillars.map((p, i) => (
                <PillarCard
                  key={p.id}
                  pillar={p}
                  fullSpan={i === pillars.length - 1 && pillars.length % 2 === 1}
                  onPress={() => navigation?.navigate?.('PillarDetail', { pillarId: p.id, pillarName: p.k })}
                />
              ))}
            </View>

            {/* Pillar targets — what mastery looks like */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pillar targets</Text>
              <Text style={styles.sectionMore}>WHAT MASTERY LOOKS LIKE</Text>
            </View>
            <View style={styles.targetsList}>
              {pillars.map(p => (
                <View key={p.id} style={[styles.targetCard, { borderLeftColor: p.color }]}>
                  <Text style={[styles.targetEyebrow, { color: p.color }]}>{p.short}</Text>
                  <Text style={styles.targetText}>{p.target}</Text>
                </View>
              ))}
            </View>

            {/* Anti-goals */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Anti-goals</Text>
              <Text style={styles.sectionMore}>THE LINES YOU WON'T CROSS</Text>
            </View>
            <View style={styles.antiCard}>
              <Text style={styles.antiEyebrow}>DO NOT BECOME</Text>
              {(vision?.anti_goals && vision.anti_goals.length > 0
                ? vision.anti_goals
                : [
                    'Trade depth for speed.',
                    'Optimize for what looks impressive on paper.',
                    'Let a bad week become a bad month.',
                    'Confuse motion with progress.',
                  ]).map((t, i) => (
                <View key={i} style={styles.antiRow}>
                  <Text style={styles.antiX}>×</Text>
                  <Text style={styles.antiText}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {sub === 'compound' && (
          <>
            {/* Compound chart */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Compound</Text>
              <Text style={styles.sectionMore}>MULTI-RANGE · SCRUBBABLE</Text>
            </View>
            <View style={styles.compoundCard}>
              <NSCompoundChart today={day} />
            </View>

            {/* Surfaces — 4-tile grid */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Surfaces</Text>
              <Text style={styles.sectionMore}>DRILL TO TRACKERS</Text>
            </View>
            <View style={styles.surfacesGrid}>
              {[
                { k: 'RUNNING',    big: stats?.hours?.this_week != null ? stats.hours.this_week.toFixed(1) : '—', u: 'h',   sub: 'this week',                color: '#E0B775' },
                { k: 'DISCIPLINE', big: String(currentStreak),                                                     u: 'd',   sub: longestStreak ? `🔥 streak · best ${longestStreak}d` : 'no streak yet',  color: colors.recoveryGreen },
                { k: 'MASTERY',    big: String(stats?.pillar_breakdown?.reduce((acc, p) => acc + (p.entry_count || 0), 0) ?? 0), u: '',   sub: `across ${stats?.pillar_breakdown?.length ?? 5} pillars`,    color: colors.accent },
                { k: 'SPEECH',     big: '—',                                                                     u: '',    sub: 'sync to view',              color: '#EC4899' },
              ].map((t, i) => (
                <View key={i} style={styles.surfaceTile}>
                  <Text style={[styles.surfaceLabel, { color: t.color }]}>{t.k}</Text>
                  <Text style={styles.surfaceBig}>
                    {t.big}
                    {t.u && <Text style={styles.surfaceUnit}>{t.u}</Text>}
                  </Text>
                  <Text style={styles.surfaceSub}>{t.sub}</Text>
                </View>
              ))}
            </View>

            {/* Activity bloom */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <Text style={styles.sectionMore}>6 MO · LONG-PRESS A DAY</Text>
            </View>
            <BloomGrid
              values={(() => {
                // Use real heatmap data — last 182 days, indexed 0=oldest, last=today
                if (heatmap.length === 0) {
                  return Array.from({ length: 26 * 7 }, () => 0);
                }
                const last182 = heatmap.slice(-182);
                return last182.map(d => {
                  const c = d.count ?? 0;
                  if (c === 0) return 0;
                  if (c === 1) return 1;
                  if (c === 2) return 2;
                  if (c <= 4) return 3;
                  return 4;
                });
              })()}
              title="Activity · 26 weeks"
              subtitle="EVERY DOT IS A 1%"
              rangeLabel={(() => {
                if (heatmap.length === 0) return '6 MO → TODAY';
                const first = heatmap.slice(-182)[0]?.date;
                const last = heatmap[heatmap.length - 1]?.date;
                if (!first || !last) return '6 MO → TODAY';
                const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                return `${fmt(first)} → ${fmt(last)}`;
              })()}
            />

            {/* Recent — last 5 deep entries */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent</Text>
              <Text style={styles.sectionMore}>LAST 5 DEEP</Text>
            </View>
            {recentEntries.length > 0 ? (
              <View style={styles.recentList}>
                {recentEntries.slice(0, 5).map((e, i) => {
                  const pillarId = e.pillar_tags?.[0];
                  const pillarColor = pillarId != null ? PILLAR_COLORS[pillarId] : colors.textTertiary;
                  const pillarName = stats?.pillar_breakdown?.find(p => p.pillar_id === pillarId)?.pillar_name?.split(' ')[0] || '—';
                  const dayLabel = (() => {
                    const d = new Date(e.entry_date + 'T12:00:00');
                    const today = new Date();
                    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
                    if (diff === 0) return 'TODAY';
                    if (diff === 1) return 'YDAY';
                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
                  })();
                  return (
                    <View key={e.id} style={[styles.recentRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                      <Text style={styles.recentDay}>{dayLabel}</Text>
                      <View style={[styles.recentDot, { backgroundColor: pillarColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={2} style={styles.recentDesc}>
                          {e.description || e.content || '—'}
                        </Text>
                        <Text style={styles.recentMeta}>
                          {pillarName.toUpperCase()} · {(e as any).duration_minutes ?? '—'}m
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.recentDepth, { color: colors.accent }]}>
                          {e.evaluation?.depth_score != null ? Math.round(e.evaluation.depth_score) : '—'}
                        </Text>
                        <Text style={styles.recentDepthLabel}>DEPTH</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyHint}>No recent entries yet.</Text>
            )}
          </>
        )}

        {sub === 'discipline' && (
          <DisciplinePanel
            habits={habits}
            heatmap={heatmap}
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            onWeeklyReview={() => navigation?.navigate?.('WeeklyReview')}
          />
        )}

        {sub === 'discipline' && false && (
          <View style={{ padding: spacing.lg, alignItems: 'center' }}>
            <Text style={styles.placeholder}>Discipline view — wired into the existing dashboard.</Text>
            <TouchableOpacity
              onPress={() => navigation?.navigate?.('WeeklyReview')}
              style={styles.placeholderBtn}
            >
              <Text style={styles.placeholderBtnText}>OPEN WEEKLY REVIEW ›</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },

  subTabBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: 'rgba(15,15,24,0.92)',
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  subTabBtnActive: {
    backgroundColor: 'rgba(155,138,232,0.14)',
    borderColor: 'rgba(155,138,232,0.5)',
  },
  subTabIcon: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  subTabText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSecondary,
    letterSpacing: 1.8,
  },

  // ── Hero
  heroCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 14,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  dayPill: {
    position: 'absolute',
    top: 18, right: 18,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.line,
    backgroundColor: 'rgba(15,15,24,0.55)',
  },
  dayPillText: {
    fontFamily: fonts.mono, fontSize: 10,
    color: colors.textSecondary, letterSpacing: 1.6,
  },
  heroEyebrow: {
    fontFamily: fonts.mono, fontSize: 10,
    color: colors.textTertiary, letterSpacing: 1.8,
  },
  heroLine: {
    fontFamily: fonts.serifItalic,
    fontSize: 24, lineHeight: 30,
    color: colors.text, letterSpacing: -0.5,
    marginTop: 10,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  heroStatCell: { flex: 1 },
  heroStatLabel: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.8,
  },
  heroStatVal: {
    fontFamily: fonts.mono, fontSize: 26,
    color: colors.text, letterSpacing: -0.6,
    marginTop: 4,
  },
  heroStatUnit: {
    fontSize: 13, color: colors.textTertiary,
    fontFamily: fonts.mono,
  },
  heroStatDelta: {
    fontFamily: fonts.mono, fontSize: 9,
    letterSpacing: 1.2, marginTop: 4,
  },
  heroStatMeta: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.2,
    marginTop: 4,
  },

  // ── Section
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  sectionMore: {
    fontFamily: fonts.mono, fontSize: 10,
    color: colors.textTertiary, letterSpacing: 1.6,
  },

  // ── Pillar quartet
  pillarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  pillarCard: {
    width: '48.5%',
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
    position: 'relative', overflow: 'hidden',
  },
  pillarRingBox: {
    position: 'absolute', top: 12, right: 12,
    width: 50, height: 50,
  },
  pillarLvlOverlay: {
    position: 'absolute', inset: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  pillarLvl: {
    fontFamily: fonts.mono, fontSize: 11,
  },
  pillarShort: {
    fontFamily: fonts.mono, fontSize: 9,
    letterSpacing: 1.8,
    paddingRight: 50,
  },
  pillarPct: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.4,
    marginTop: 4,
    lineHeight: 24,
  },
  pillarPctUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textTertiary,
    fontStyle: 'normal',
  },
  pillarSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 14,
    paddingRight: 50,
  },
  pillarFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
    paddingRight: 50,
  },
  pillarFootText: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.4,
  },
  pillarFootDelta: {
    fontFamily: fonts.mono, fontSize: 11,
    letterSpacing: 0.8,
  },

  // ── Targets
  targetsList: { marginHorizontal: 16, gap: 10, marginBottom: 14 },
  targetCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
    borderLeftWidth: 3,
  },
  targetEyebrow: {
    fontFamily: fonts.mono, fontSize: 9,
    letterSpacing: 1.8,
  },
  targetText: {
    fontFamily: fonts.serifItalic,
    fontSize: 17,
    color: colors.text,
    lineHeight: 24,
    marginTop: 6,
  },

  // ── Anti-goals
  antiCard: {
    marginHorizontal: 16, marginBottom: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  antiEyebrow: {
    fontFamily: fonts.mono, fontSize: 9,
    color: '#E27A6E', letterSpacing: 1.8, marginBottom: 12,
  },
  antiRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'baseline',
    paddingVertical: 5,
  },
  antiX: {
    fontFamily: fonts.mono, fontSize: 11,
    color: '#E27A6E',
    width: 14,
  },
  antiText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },

  // ── Compound
  compoundCard: {
    marginHorizontal: 16, marginBottom: 18,
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },

  placeholder: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },
  placeholderBtn: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  placeholderBtnText: {
    fontFamily: fonts.mono, fontSize: 11,
    color: colors.accent, letterSpacing: 2,
  },

  // ── Compound surfaces tile grid
  surfacesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 18,
  },
  surfaceTile: {
    width: '48.5%',
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  surfaceLabel: {
    fontFamily: fonts.mono, fontSize: 9,
    letterSpacing: 1.8,
  },
  surfaceBig: {
    fontFamily: fonts.mono, fontSize: 28,
    color: colors.text,
    letterSpacing: -0.6,
    marginTop: 6,
    lineHeight: 30,
  },
  surfaceUnit: {
    fontFamily: fonts.mono, fontSize: 12,
    color: colors.textTertiary,
  },
  surfaceSub: {
    fontFamily: fonts.regular, fontSize: 11,
    color: colors.textSecondary,
    marginTop: 8,
  },

  // ── Compound recent list
  recentList: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  recentDay: {
    width: 50,
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.4,
  },
  recentDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  recentDesc: {
    fontFamily: fonts.regular, fontSize: 13,
    color: colors.text,
  },
  recentMeta: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.2,
    marginTop: 3,
  },
  recentDepth: {
    fontFamily: fonts.mono, fontSize: 18,
  },
  recentDepthLabel: {
    fontFamily: fonts.mono, fontSize: 8,
    color: colors.textTertiary, letterSpacing: 1.4,
  },
  emptyHint: {
    fontFamily: fonts.regular, fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginVertical: 20,
  },
});

// ── Discipline-panel styles (separate sheet for clarity)
const dStyles = StyleSheet.create({
  heroCard: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 12,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  grade: {
    fontFamily: fonts.serifItalic,
    fontSize: 76,
    lineHeight: 86,        // generous line-height so serif italic ascenders/arms fully render
    letterSpacing: -0.5,   // single-glyph; tight kerning crops in RN
    paddingHorizontal: 4,  // safety against italic slant clipping
  },
  gradeCount: {
    fontFamily: fonts.mono, fontSize: 26,
    color: colors.text, letterSpacing: -0.5,
  },
  gradeCountTotal: {
    fontFamily: fonts.mono, fontSize: 16,
    color: colors.textTertiary,
  },
  gradeLabel: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.8,
    marginTop: 2,
  },
  heroTone: {
    fontFamily: fonts.serifItalic, fontSize: 16,
    color: colors.textSecondary,
    marginTop: 14, lineHeight: 22,
  },
  chipRow: {
    flexDirection: 'row', gap: 8,
    marginTop: 16,
  },
  chip: {
    flex: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15,15,24,0.6)',
    borderWidth: 1, borderColor: colors.line,
  },
  chipLabel: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.6,
  },
  chipValue: {
    fontFamily: fonts.mono, fontSize: 20,
    marginTop: 2,
    letterSpacing: -0.4,
  },

  subCard: {
    marginHorizontal: 16, marginBottom: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  subCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eyebrow: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.6,
  },

  dotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendLabel: {
    fontFamily: fonts.mono, fontSize: 8,
    color: colors.textTertiary, letterSpacing: 1.2,
  },

  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  habitGlyph: {
    width: 32, height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  habitGlyphText: {
    fontFamily: fonts.monoMedium, fontSize: 13,
  },
  habitName: {
    fontFamily: fonts.regular, fontSize: 14,
  },
  habitMeta: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textTertiary, letterSpacing: 1.2,
    marginTop: 2,
  },
  habitStreak: {
    fontFamily: fonts.mono, fontSize: 14,
  },
  habitStreakLabel: {
    fontFamily: fonts.mono, fontSize: 8,
    color: colors.textTertiary, letterSpacing: 1.4,
    marginTop: 1,
  },

  heatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },

  coachCard: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16, marginBottom: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(155,138,232,0.08)',
    borderWidth: 1, borderColor: 'rgba(155,138,232,0.3)',
  },
  coachAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: {
    fontFamily: fonts.monoMedium, fontSize: 12,
    color: colors.bg,
  },
  coachEyebrow: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.accent, letterSpacing: 1.8,
    marginBottom: 4,
  },
  coachLine: {
    fontFamily: fonts.serifItalic, fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },

  reviewBtn: {
    alignSelf: 'center',
    marginTop: 4, marginBottom: 24,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.accent,
  },
  reviewBtnText: {
    fontFamily: fonts.mono, fontSize: 11,
    color: colors.accent, letterSpacing: 2,
  },
});

// touch 1777337250
