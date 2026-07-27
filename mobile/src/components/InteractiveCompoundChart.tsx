/**
 * InteractiveCompoundChart — ideal-target (dotted) vs actual-path (solid) compound
 * curve with a horizontal scrubber, range selector (7D/30D/90D/ALL), and an
 * ahead/behind pill.
 *
 * The "ideal" series is a fixed 1.01^n target. The "actual" series is computed
 * from a per-day delta you provide (or a deterministic pseudo-random walk around
 * the 1% target if no series is provided).
 *
 * Interaction notes:
 *  • Pan geometry is read from a ref that is refreshed every render, so changing
 *    range never leaves the scrubber mapping to a stale window.
 *  • The responder only claims *horizontal* drags, so the parent ScrollView keeps
 *    vertical scrolling and the two gestures don't fight.
 *  • X-axis shows sparse calendar checkpoints (dates/months), not day indices.
 */

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Dimensions } from 'react-native';
import Svg, {
  Path,
  Line,
  Circle,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  G,
} from 'react-native-svg';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

interface Props {
  /** Day index (1+). The chart spans days 0..day. */
  day: number;
  /** Per-day actual multipliers (length day+1). If omitted, a deterministic walk is generated. */
  actualSeries?: number[];
  /** Initial range. */
  initialRange?: '7d' | '30d' | '90d' | 'all';
  /** Hide range selector and legend (used in compact heroes). */
  compact?: boolean;
  /** Override width (otherwise window width minus 32px page margin minus 44px hero padding). */
  width?: number;
  /** SVG height (default 168). */
  height?: number;
  /** Calendar date of the final day (defaults to today). Used for axis labels. */
  endDate?: Date;
}

const RANGES: Array<{ k: '7d' | '30d' | '90d' | 'all'; l: string; n: number | 'all' }> = [
  { k: '7d', l: '7D', n: 7 },
  { k: '30d', l: '30D', n: 30 },
  { k: '90d', l: '90D', n: 90 },
  { k: 'all', l: 'ALL', n: 'all' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function InteractiveCompoundChart({
  day,
  actualSeries,
  initialRange = 'all',
  compact = false,
  width: propWidth,
  height: H = 176,
  endDate,
}: Props) {
  const screenW = Dimensions.get('window').width;
  // 16px page margin × 2 + 22px hero padding × 2 = 76px taken by the parent
  const W = propWidth ?? Math.max(280, screenW - 76);
  const padL = 10, padR = 10, padT = 22, padB = 24;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const safeDay = Math.max(1, Math.round(day));
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>(initialRange);
  const span = (() => {
    const n = RANGES.find(r => r.k === range)?.n;
    return n === 'all' || n == null ? safeDay : Math.min(n as number, safeDay);
  })();
  const startDay = Math.max(0, safeDay - span);
  const endDay = safeDay;
  const visibleN = Math.max(1, endDay - startDay);

  // Generate ideal + actual series.
  const data = useMemo(() => {
    const ideal: number[] = [];
    const actual: number[] = [];
    let actualVal = 1;
    for (let i = 0; i <= safeDay; i++) {
      ideal.push(Math.pow(1.01, i));
      if (actualSeries && actualSeries[i] != null) {
        actual.push(actualSeries[i]);
        actualVal = actualSeries[i];
      } else {
        const seed = Math.sin(i * 12.9898) * 43758.5453;
        const r = seed - Math.floor(seed) - 0.5;
        const weekly = i % 7 === 0 ? -0.004 : 0;
        const dailyDelta = 0.0098 + r * 0.014 + weekly;
        actualVal *= 1 + dailyDelta;
        actual.push(actualVal);
      }
    }
    return { ideal, actual };
  }, [safeDay, actualSeries]);

  // Y range scoped to visible window.
  const visIdeal = data.ideal.slice(startDay, endDay + 1);
  const visActual = data.actual.slice(startDay, endDay + 1);
  const minV = Math.min(...visIdeal, ...visActual) * 0.98;
  const maxV = Math.max(...visIdeal, ...visActual) * 1.02;

  const xAt = (i: number) => padL + ((i - startDay) / visibleN) * cw;
  const yAt = (v: number) =>
    padT + ch - ((v - minV) / Math.max(0.0001, maxV - minV)) * ch;

  const idealPath = visIdeal
    .map((v, k) => `${k === 0 ? 'M' : 'L'} ${xAt(startDay + k).toFixed(2)} ${yAt(v).toFixed(2)}`)
    .join(' ');
  const actualPath = visActual
    .map((v, k) => `${k === 0 ? 'M' : 'L'} ${xAt(startDay + k).toFixed(2)} ${yAt(v).toFixed(2)}`)
    .join(' ');
  const actualFill = `${actualPath} L ${xAt(endDay).toFixed(2)} ${(padT + ch).toFixed(2)} L ${xAt(startDay).toFixed(2)} ${(padT + ch).toFixed(2)} Z`;

  // --- Scrubbing -------------------------------------------------------------
  // `scrubIdx === null` means "live" (pinned to today). Any drag sets an index.
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const activeIdx = scrubIdx == null ? endDay : Math.min(endDay, Math.max(startDay, scrubIdx));
  const isLive = scrubIdx == null;

  // Snap back to live whenever the window changes — a held index from another
  // range is meaningless in the new one.
  useEffect(() => { setScrubIdx(null); }, [range, safeDay]);

  // Geometry the pan handlers need, refreshed every render so the responder
  // (created once) never reads a stale window. This is the fix for the scrubber
  // drifting after a range change.
  const geo = useRef({ padL, cw, startDay, visibleN });
  geo.current = { padL, cw, startDay, visibleN };

  const lastTicked = useRef<number>(-1);

  const moveTo = useCallback((locationX: number) => {
    const g = geo.current;
    const ratio = Math.max(0, Math.min(1, (locationX - g.padL) / g.cw));
    const next = g.startDay + Math.round(ratio * g.visibleN);
    if (next !== lastTicked.current) {
      lastTicked.current = next;
      haptic.selection();
    }
    setScrubIdx(next);
  }, []);

  const pan = useRef(
    PanResponder.create({
      // Claim a tap immediately…
      onStartShouldSetPanResponder: () => true,
      // …but only steal an ongoing gesture from the ScrollView when it's
      // clearly horizontal, so vertical scrolling still works over the chart.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      // Once we own it, don't let the ScrollView take it back mid-drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => moveTo(e.nativeEvent.locationX),
      onPanResponderMove: e => moveTo(e.nativeEvent.locationX),
      onPanResponderRelease: () => { lastTicked.current = -1; },
      onPanResponderTerminate: () => { lastTicked.current = -1; },
    }),
  ).current;

  const sIdeal = data.ideal[activeIdx];
  const sActual = data.actual[activeIdx];
  const ahead = sActual >= sIdeal;
  const diff = (sActual / sIdeal - 1) * 100;

  // --- Calendar labels -------------------------------------------------------
  const end = endDate ?? new Date();
  const dateForDay = useCallback((idx: number) => {
    const d = new Date(end);
    d.setDate(d.getDate() - (safeDay - idx));
    return d;
  }, [end, safeDay]);

  const fmtTick = useCallback((idx: number) => {
    const d = dateForDay(idx);
    // Long windows read better as months; short ones as "Jul 8".
    if (visibleN > 120) return MONTHS[d.getMonth()];
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }, [dateForDay, visibleN]);

  // Sparse checkpoints: 3 for narrow/short windows, 4 when there's room.
  const tickIdxs = useMemo(() => {
    const count = cw > 300 && visibleN >= 12 ? 4 : 3;
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(Math.round(startDay + (visibleN * i) / (count - 1)));
    }
    return Array.from(new Set(out));
  }, [startDay, visibleN, cw]);

  // Y baselines worth showing
  const yTicks = [1.5, 2, 3, 4, 5].filter(v => v < maxV && v > minV);

  // Scrub chip, clamped so it never overflows the SVG edges.
  const chipW = 62;
  const chipX = Math.max(padL, Math.min(padL + cw - chipW, xAt(activeIdx) - chipW / 2));
  const scrubDate = dateForDay(activeIdx);

  return (
    <View style={{ marginTop: 6 }}>
      {/* Stat row */}
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>{isLive ? 'YOU · TODAY' : 'YOU'}</Text>
          <Text style={[styles.statVal, { color: colors.accent }]}>
            {sActual.toFixed(2)}
            <Text style={styles.statTimes}>×</Text>
          </Text>
        </View>
        <View style={[
          styles.deltaPill,
          ahead
            ? { borderColor: 'rgba(125,211,164,0.3)', backgroundColor: 'rgba(125,211,164,0.1)' }
            : { borderColor: 'rgba(217,197,111,0.3)', backgroundColor: 'rgba(217,197,111,0.1)' },
        ]}>
          <Text style={[styles.deltaText, { color: ahead ? colors.recoveryGreen : colors.warn }]}>
            {ahead ? '↗ +' : '↘ '}{diff.toFixed(1)}%
          </Text>
        </View>
        <View style={[styles.statCell, { alignItems: 'flex-end' }]}>
          <Text style={styles.statLabel}>TARGET</Text>
          <Text style={[styles.statVal, { color: colors.textSecondary }]}>
            {sIdeal.toFixed(2)}
            <Text style={styles.statTimes}>×</Text>
          </Text>
        </View>
      </View>

      {/* SVG */}
      <View {...pan.panHandlers}>
        <Svg width={W} height={H}>
          <Defs>
            <SvgLinearGradient id="ic-fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.32" />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="ic-line" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={colors.accent2} />
              <Stop offset="100%" stopColor={colors.accent} />
            </SvgLinearGradient>
          </Defs>

          {/* Y baselines */}
          {yTicks.map(v => (
            <G key={v}>
              <Line x1={padL} x2={padL + cw} y1={yAt(v)} y2={yAt(v)}
                stroke={colors.line} strokeWidth={0.5} strokeDasharray="1 3" opacity={0.5} />
              <SvgText x={padL + cw - 2} y={yAt(v) - 3} textAnchor="end"
                fontSize={8} fontFamily={fonts.mono} fill={colors.textTertiary}>{v}×</SvgText>
            </G>
          ))}

          {/* Sparse calendar checkpoints — faint vertical guides */}
          {tickIdxs.map(i => (
            <Line key={`g${i}`} x1={xAt(i)} x2={xAt(i)} y1={padT} y2={padT + ch}
              stroke={colors.line} strokeWidth={0.5} opacity={0.35} />
          ))}

          {/* Ideal target — dashed */}
          <Path d={idealPath} fill="none" stroke={colors.textTertiary}
            strokeWidth={1.4} strokeDasharray="3 4" strokeLinecap="round" />

          {/* Actual fill */}
          <Path d={actualFill} fill="url(#ic-fill)" />

          {/* Actual line */}
          <Path d={actualPath} fill="none" stroke="url(#ic-line)" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />

          {/* Scrubber line — only while actively scrubbing */}
          {!isLive && (
            <Line x1={xAt(activeIdx)} x2={xAt(activeIdx)} y1={padT} y2={padT + ch}
              stroke={colors.text} strokeWidth={1} strokeDasharray="2 2" opacity={0.45} />
          )}

          {/* Scrub chip — date + day, clamped inside the plot */}
          {!isLive && (
            <G>
              <Rect x={chipX} y={2} width={chipW} height={16} rx={8}
                fill={colors.bg} stroke={colors.line} strokeWidth={0.8} />
              <SvgText x={chipX + chipW / 2} y={13} textAnchor="middle"
                fontSize={9} fontFamily={fonts.mono} fill={colors.textSecondary}>
                {MONTHS[scrubDate.getMonth()]} {scrubDate.getDate()} · D{activeIdx}
              </SvgText>
            </G>
          )}

          {/* Dots at the active index (defaults to today) */}
          <Circle cx={xAt(activeIdx)} cy={yAt(sIdeal)} r={3}
            fill={colors.bg} stroke={colors.textTertiary} strokeWidth={1.4} />
          {/* Soft halo so the live dot reads at a glance */}
          <Circle cx={xAt(activeIdx)} cy={yAt(sActual)} r={9}
            fill={colors.accent} opacity={0.16} />
          <Circle cx={xAt(activeIdx)} cy={yAt(sActual)} r={5}
            fill={colors.accent} stroke={colors.bg} strokeWidth={2} />

          {/* X axis — sparse calendar checkpoints */}
          {tickIdxs.map((i, k) => {
            const anchor = k === 0 ? 'start' : k === tickIdxs.length - 1 ? 'end' : 'middle';
            const x = k === 0 ? padL : k === tickIdxs.length - 1 ? padL + cw : xAt(i);
            return (
              <SvgText key={`t${i}`} x={x} y={H - 7} textAnchor={anchor}
                fontSize={9} fontFamily={fonts.mono} fill={colors.textTertiary}>
                {fmtTick(i)}
              </SvgText>
            );
          })}
        </Svg>
      </View>

      {/* Range selector + legend */}
      {!compact && (
        <>
          <View style={styles.rangeRow}>
            <View style={styles.rangePill}>
              {RANGES.map(r => (
                <TouchableOpacity
                  key={r.k}
                  onPress={() => { haptic.selection(); setRange(r.k); }}
                  activeOpacity={0.85}
                  style={[styles.rangeBtn, range === r.k && { backgroundColor: colors.accent }]}
                >
                  <Text
                    style={[
                      styles.rangeBtnText,
                      { color: range === r.k ? colors.bg : colors.textTertiary },
                    ]}
                  >
                    {r.l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.accent }]} />
              <Text style={styles.legendText}>YOUR PATH</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatchDashed]} />
              <Text style={styles.legendText}>1% / DAY TARGET</Text>
            </View>
            {!isLive && (
              <TouchableOpacity onPress={() => { haptic.light(); setScrubIdx(null); }} activeOpacity={0.8}>
                <Text style={[styles.legendText, { color: colors.accent }]}>↺ TODAY</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  statCell: { flex: 1 },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  statVal: {
    fontFamily: fonts.mono,
    fontSize: 20,
    letterSpacing: -0.5,
  },
  statTimes: {
    fontFamily: fonts.mono,
    fontSize: 14,
    opacity: 0.7,
  },
  deltaPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  deltaText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },

  rangeRow: { marginTop: 8, alignItems: 'center' },
  rangePill: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    backgroundColor: 'rgba(15,15,24,0.5)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
  },
  rangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  rangeBtnText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.6,
  },

  legend: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 2, borderRadius: 1 },
  legendSwatchDashed: {
    width: 14,
    height: 0,
    borderTopWidth: 1.4,
    borderTopColor: colors.textTertiary,
    borderStyle: 'dashed' as const,
  },
  legendText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
});
