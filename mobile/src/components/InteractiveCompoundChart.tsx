/**
 * InteractiveCompoundChart — ideal-target (dotted) vs actual-path (solid) compound
 * curve with horizontal scrubber, range selector (7D/30D/90D/ALL), and ahead/behind
 * pill. Mirrors `app.jsx` `InteractiveCompound` from the design canvas.
 *
 * The "ideal" series is a fixed 1.01^n target. The "actual" series is computed
 * from a per-day delta you provide (or a deterministic pseudo-random walk
 * around the 1% target if no series is provided — useful for the design hero
 * before live data is wired up).
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';
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
  /** Override width (otherwise window width minus 32px page margin minus 36px hero padding). */
  width?: number;
  /** SVG height (default 168). */
  height?: number;
}

const RANGES: Array<{ k: '7d' | '30d' | '90d' | 'all'; l: string; n: number | 'all' }> = [
  { k: '7d', l: '7D', n: 7 },
  { k: '30d', l: '30D', n: 30 },
  { k: '90d', l: '90D', n: 90 },
  { k: 'all', l: 'ALL', n: 'all' },
];

export default function InteractiveCompoundChart({
  day,
  actualSeries,
  initialRange = 'all',
  compact = false,
  width: propWidth,
  height: H = 168,
}: Props) {
  const screenW = Dimensions.get('window').width;
  // 16px page margin × 2 + 22px hero padding × 2 = 76px taken by the parent
  const W = propWidth ?? Math.max(280, screenW - 76);
  const padL = 8, padR = 8, padT = 12, padB = 22;
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
  const visibleN = endDay - startDay;

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

  const xAt = (i: number) => padL + ((i - startDay) / Math.max(1, visibleN)) * cw;
  const yAt = (v: number) =>
    padT + ch - ((v - minV) / Math.max(0.0001, maxV - minV)) * ch;

  const idealPath = visIdeal
    .map((v, k) => `${k === 0 ? 'M' : 'L'} ${xAt(startDay + k).toFixed(2)} ${yAt(v).toFixed(2)}`)
    .join(' ');
  const actualPath = visActual
    .map((v, k) => `${k === 0 ? 'M' : 'L'} ${xAt(startDay + k).toFixed(2)} ${yAt(v).toFixed(2)}`)
    .join(' ');
  const actualFill = `${actualPath} L ${xAt(endDay).toFixed(2)} ${(padT + ch).toFixed(2)} L ${xAt(startDay).toFixed(2)} ${(padT + ch).toFixed(2)} Z`;

  const [scrubIdx, setScrubIdx] = useState<number>(safeDay);
  useEffect(() => {
    if (scrubIdx < startDay) setScrubIdx(startDay);
    if (scrubIdx > endDay) setScrubIdx(endDay);
  }, [startDay, endDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastTickedDay = useRef<number>(-1);

  const moveTo = (locationX: number) => {
    const ratio = Math.max(0, Math.min(1, (locationX - padL) / cw));
    const next = startDay + Math.round(ratio * visibleN);
    if (next !== lastTickedDay.current) {
      lastTickedDay.current = next;
      haptic.selection();
    }
    setScrubIdx(next);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => moveTo(e.nativeEvent.locationX),
      onPanResponderMove: e => moveTo(e.nativeEvent.locationX),
      onPanResponderRelease: () => { lastTickedDay.current = -1; },
    }),
  ).current;

  const sIdeal = data.ideal[scrubIdx];
  const sActual = data.actual[scrubIdx];
  const ahead = sActual >= sIdeal;
  const diff = (sActual / sIdeal - 1) * 100;

  // Y baselines worth showing
  const yTicks = [1.5, 2, 3, 4, 5].filter(v => v < maxV && v > minV);

  return (
    <View style={{ marginTop: 6 }}>
      {/* Stat row */}
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>YOU</Text>
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

          {/* Ideal target — dashed */}
          <Path d={idealPath} fill="none" stroke={colors.textTertiary}
            strokeWidth={1.4} strokeDasharray="3 4" strokeLinecap="round" />

          {/* Actual fill */}
          <Path d={actualFill} fill="url(#ic-fill)" />

          {/* Actual line */}
          <Path d={actualPath} fill="none" stroke="url(#ic-line)" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />

          {/* Scrubber line */}
          <Line x1={xAt(scrubIdx)} x2={xAt(scrubIdx)} y1={padT - 2} y2={padT + ch + 2}
            stroke={colors.text} strokeWidth={1} strokeDasharray="2 2" opacity={0.4} />

          {/* Scrubber day label */}
          <Rect x={xAt(scrubIdx) - 22} y={padT - 16} width={44} height={14} rx={7}
            fill={colors.bg} stroke={colors.line} strokeWidth={0.8} />
          <SvgText x={xAt(scrubIdx)} y={padT - 6} textAnchor="middle"
            fontSize={9} fontFamily={fonts.mono} fill={colors.textSecondary}>
            D{String(scrubIdx).padStart(3, '0')}
          </SvgText>

          {/* Dots at scrubber */}
          <Circle cx={xAt(scrubIdx)} cy={yAt(sIdeal)} r={3}
            fill={colors.bg} stroke={colors.textTertiary} strokeWidth={1.4} />
          <Circle cx={xAt(scrubIdx)} cy={yAt(sActual)} r={5}
            fill={colors.accent} stroke={colors.bg} strokeWidth={2} />

          {/* X axis labels — anchored to visible window */}
          <SvgText x={padL} y={H - 6} fontSize={9} fontFamily={fonts.mono}
            fill={colors.textTertiary}>D{startDay || 1}</SvgText>
          <SvgText x={padL + cw / 2} y={H - 6} textAnchor="middle"
            fontSize={9} fontFamily={fonts.mono} fill={colors.textTertiary}>
            D{Math.round((startDay + endDay) / 2)}
          </SvgText>
          <SvgText x={padL + cw} y={H - 6} textAnchor="end"
            fontSize={9} fontFamily={fonts.mono} fill={colors.textTertiary}>D{endDay}</SvgText>
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
                  onPress={() => setRange(r.k)}
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
