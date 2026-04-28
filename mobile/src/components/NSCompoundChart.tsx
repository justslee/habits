/**
 * NSCompoundChart — multi-mode / multi-range / scrubbable compound chart.
 * Direct port of `NSCompoundV2` from `ns-compound-v2.jsx` in the design canvas.
 *
 *   • Range pills:    30D · 90D · 1Y · ALL
 *   • Unit toggle:    × · % · d
 *   • Mode tabs:      COMPOSITE · PILLARS · FORECAST
 *   • AHEAD/BEHIND badge top-right, scrub readout below chart
 *   • Stat strip:     NOW · VELOCITY · STREAK · 1Y PROJ
 *
 * Pillars are pulled from a static description (matches NS_PILLARS); for live
 * apps you can pass `pillars` to override.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder, Dimensions,
} from 'react-native';
import Svg, {
  Path, Line, Circle, Defs, LinearGradient as SvgLG, Stop, Pattern,
  Text as SvgText, G,
} from 'react-native-svg';
import { colors, fonts, radius } from '../theme';
import { haptic } from '../utils/haptics';
import { PILLAR_COLORS } from '../theme';

interface PillarSpec {
  id: number;
  short: string;
  trend: 'up' | 'down' | 'flat';
  pct: number;
  color: string;
}

const DEFAULT_PILLARS: PillarSpec[] = [
  { id: 1, short: 'QUANT',  trend: 'up',   pct: 0.74, color: PILLAR_COLORS[1] },
  { id: 2, short: 'MACRO',  trend: 'up',   pct: 0.58, color: PILLAR_COLORS[2] },
  { id: 3, short: 'ML',     trend: 'up',   pct: 0.81, color: PILLAR_COLORS[3] },
  { id: 4, short: 'AI',     trend: 'up',   pct: 0.69, color: PILLAR_COLORS[4] },
  { id: 5, short: 'SPEAK',  trend: 'down', pct: 0.55, color: PILLAR_COLORS[5] },
];

interface Props {
  /** Days since day-zero (today's index). */
  today?: number;
  /** Override the pillar list. */
  pillars?: PillarSpec[];
}

type RangeKey = '30' | '90' | '1y' | 'all';
type Mode = 'composite' | 'pillars' | 'forecast';
type Unit = 'mult' | 'pct' | 'days';

const RANGES: Array<{ k: RangeKey; l: string; days: number; label: string }> = [
  { k: '30',  l: '30D',  days: 30,  label: '30 DAYS' },
  { k: '90',  l: '90D',  days: 90,  label: '90 DAYS' },
  { k: '1y',  l: '1Y',   days: 365, label: '1 YEAR' },
  { k: 'all', l: 'ALL',  days: 0,   label: 'LIFETIME' },
];

const MODES: Array<{ k: Mode; l: string }> = [
  { k: 'composite', l: 'COMPOSITE' },
  { k: 'pillars',   l: 'PILLARS' },
  { k: 'forecast',  l: 'FORECAST' },
];

const UNITS: Array<{ k: Unit; l: string }> = [
  { k: 'mult', l: '×' },
  { k: 'pct',  l: '%' },
  { k: 'days', l: 'd' },
];

const fmtMult = (v: number) => v >= 10 ? `${v.toFixed(1)}×` : `${v.toFixed(2)}×`;

function noise(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) - 0.5;
}

function buildPillarSeries(pillarIndex: number, totalDays: number, startDay: number, baseRate = 0.01, vol = 0.012): number[] {
  let v = 1;
  const out: number[] = [v];
  for (let i = 1; i <= totalDays; i++) {
    const n = noise((startDay + i) * 7.3 + pillarIndex * 91.7);
    v = v * (1 + baseRate + n * vol);
    out.push(v);
  }
  return out;
}

export default function NSCompoundChart({ today = 90, pillars = DEFAULT_PILLARS }: Props) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('90');
  const [mode, setMode] = useState<Mode>('composite');
  const [unit, setUnit] = useState<Unit>('mult');
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  const range = RANGES.find(r => r.k === rangeKey)!;
  const totalDays = rangeKey === 'all' ? today : Math.min(range.days, today);
  const startDay = today - totalDays;

  // Series
  const ideal = useMemo(() => Array.from({ length: totalDays + 1 }, (_, i) => Math.pow(1.01, i)), [totalDays]);
  const pillarSeries = useMemo(() =>
    pillars.map((p, i) => {
      const base = p.trend === 'up' ? 0.0105 : p.trend === 'down' ? 0.0092 : 0.010;
      const offset = (p.pct - 0.6) * 0.002;
      return buildPillarSeries(i, totalDays, startDay, base + offset, 0.014);
    }),
    [pillars, totalDays, startDay],
  );
  const composite = useMemo(() => {
    if (pillarSeries.length === 0) return ideal;
    const out: number[] = [];
    for (let i = 0; i <= totalDays; i++) {
      let prod = 1;
      for (let j = 0; j < pillarSeries.length; j++) prod *= pillarSeries[j][i];
      out.push(Math.pow(prod, 1 / pillarSeries.length));
    }
    return out;
  }, [pillarSeries, totalDays, ideal]);

  // Forecast cone
  const forecastDays = mode === 'forecast' ? Math.min(30, Math.max(7, Math.floor(totalDays * 0.2))) : 0;
  const forecast = useMemo(() => {
    if (forecastDays === 0) return null;
    const last = composite[composite.length - 1];
    const prev = composite[Math.max(0, composite.length - 15)];
    const dailyR = Math.pow(last / prev, 1 / 14) - 1;
    const lo = Math.max(0, dailyR - 0.004);
    const hi = dailyR + 0.004;
    const mid: number[] = [], up: number[] = [], dn: number[] = [];
    let vM = last, vU = last, vD = last;
    for (let i = 0; i <= forecastDays; i++) {
      mid.push(vM); up.push(vU); dn.push(vD);
      vM *= 1 + dailyR;
      vU *= 1 + hi;
      vD *= 1 + lo;
    }
    return { mid, up, dn };
  }, [composite, forecastDays]);

  // Geometry
  const screenW = Dimensions.get('window').width;
  const w = screenW - 64; // 16px parent + 16px hero/card padding × 2
  const h = 220;
  const padL = 28, padR = 12, padT = 18, padB = 30;
  const visibleDays = totalDays + forecastDays;
  const xRange = w - padL - padR;
  const yRange = h - padT - padB;

  const ymax = useMemo(() => {
    let m = ideal[totalDays];
    if (mode === 'composite' || mode === 'forecast') m = Math.max(m, composite[totalDays]);
    if (mode === 'pillars') {
      pillarSeries.forEach((s, i) => { if (!hidden.has(i)) m = Math.max(m, s[totalDays]); });
    }
    if (mode === 'forecast' && forecast) m = Math.max(m, forecast.up[forecastDays]);
    return m * 1.06;
  }, [mode, ideal, composite, pillarSeries, hidden, forecast, totalDays, forecastDays]);
  const ymin = 0.95;

  const xOf = (i: number) => padL + (i / Math.max(1, visibleDays)) * xRange;
  const yOf = (v: number) => padT + (1 - (v - ymin) / (ymax - ymin)) * yRange;

  // Scrubber pan
  const lastTickedIdx = useRef<number>(-1);
  const moveTo = (locationX: number) => {
    const ratio = Math.max(0, Math.min(1, (locationX - padL) / xRange));
    const idx = Math.max(0, Math.min(totalDays, Math.round(ratio * visibleDays)));
    if (idx !== lastTickedIdx.current) {
      lastTickedIdx.current = idx;
      haptic.selection();
    }
    setScrubIdx(idx);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => moveTo(e.nativeEvent.locationX),
      onPanResponderMove:  e => moveTo(e.nativeEvent.locationX),
      onPanResponderRelease: () => { lastTickedIdx.current = -1; setScrubIdx(null); },
      onPanResponderTerminate: () => { lastTickedIdx.current = -1; setScrubIdx(null); },
    }),
  ).current;

  const focusIdx = scrubIdx != null ? scrubIdx : totalDays;
  const idealAtFocus = ideal[focusIdx];
  const youAtFocus = composite[focusIdx];
  const gap = youAtFocus - idealAtFocus;
  const ahead = gap >= 0;

  const display = (v: number) => {
    if (unit === 'mult') return fmtMult(v);
    if (unit === 'pct')  return `${((v - 1) * 100).toFixed(0)}%`;
    return `${Math.round(Math.log(v) / Math.log(1.01))}d`;
  };

  // Y gridline values (4 ticks)
  const gridValues = useMemo(() => {
    const ticks: number[] = [];
    const step = Math.max(0.25, (ymax - ymin) / 4);
    for (let v = 1; v <= ymax; v += step) ticks.push(v);
    return ticks.slice(0, 5);
  }, [ymax, ymin]);

  // Path builders
  const pathOf = (series: number[]) =>
    series.map((v, i) => `${i ? 'L' : 'M'} ${xOf(i).toFixed(2)} ${yOf(v).toFixed(2)}`).join(' ');
  const fillOf = (series: number[]) =>
    `${pathOf(series)} L ${xOf(series.length - 1).toFixed(2)} ${yOf(ymin).toFixed(2)} L ${xOf(0).toFixed(2)} ${yOf(ymin).toFixed(2)} Z`;
  const forecastPath = (s: number[]) =>
    s.map((v, i) => `${i ? 'L' : 'M'} ${xOf(totalDays + i).toFixed(2)} ${yOf(v).toFixed(2)}`).join(' ');
  const forecastBand = forecast
    ? `${forecastPath(forecast.up)} L ${xOf(visibleDays).toFixed(2)} ${yOf(forecast.dn[forecastDays]).toFixed(2)} ${[...forecast.dn].reverse().map((v, i) => `L ${xOf(visibleDays - i).toFixed(2)} ${yOf(v).toFixed(2)}`).join(' ')} Z`
    : '';

  // Stat strip values
  const last = composite[totalDays];
  const lastIdeal = ideal[totalDays];
  const v30 = composite[Math.max(0, totalDays - 30)];
  const velocity = totalDays >= 30 ? Math.pow(last / v30, 365 / 30) - 1 : null;
  const streak = useMemo(() => {
    let count = 0;
    for (let i = composite.length - 1; i > 0; i--) {
      const dailyMe = composite[i] / composite[i - 1];
      if (dailyMe >= 1.005) count++;
      else break;
    }
    return count;
  }, [composite]);

  return (
    <View style={{ position: 'relative' }}>
      {/* RANGE pills (left) + UNIT toggle (right) */}
      <View style={styles.topRow}>
        <View style={styles.rangePillBar}>
          {RANGES.map(r => (
            <TouchableOpacity
              key={r.k}
              activeOpacity={0.85}
              onPress={() => setRangeKey(r.k)}
              style={[styles.rangeBtn, rangeKey === r.k && styles.rangeBtnActive]}
            >
              <Text style={[styles.rangeBtnText, rangeKey === r.k && { color: colors.bg }]}>{r.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.unitBar}>
          {UNITS.map(u => (
            <TouchableOpacity
              key={u.k}
              activeOpacity={0.85}
              onPress={() => setUnit(u.k)}
              style={[styles.unitBtn, unit === u.k && styles.unitBtnActive]}
            >
              <Text style={[styles.unitBtnText, unit === u.k && { color: colors.bg }]}>{u.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* MODE tabs */}
      <View style={styles.modeRow}>
        {MODES.map(m => (
          <TouchableOpacity
            key={m.k}
            activeOpacity={0.85}
            onPress={() => setMode(m.k)}
            style={[styles.modeBtn, mode === m.k && styles.modeBtnActive]}
          >
            <Text style={[
              styles.modeBtnText,
              { color: mode === m.k ? colors.accent : colors.textTertiary },
            ]}>
              {m.l}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* CHART */}
      <View {...pan.panHandlers}>
        <Svg width={w} height={h}>
          <Defs>
            <SvgLG id="ns2-fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={colors.accent} stopOpacity="0.36" />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
            </SvgLG>
            <Pattern id="ns2-fc-stripe" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
              <Line x1={0} y1={0} x2={0} y2={6} stroke={colors.accent} strokeWidth={1} opacity={0.18} />
            </Pattern>
          </Defs>

          {/* Y gridlines + labels */}
          {gridValues.map((v, i) => (
            <G key={i}>
              <Line x1={padL} x2={w - padR} y1={yOf(v)} y2={yOf(v)}
                stroke={colors.line} strokeWidth={0.5} strokeDasharray="2 4" />
              <SvgText x={padL - 4} y={yOf(v) + 3} textAnchor="end"
                fontFamily={fonts.mono} fontSize={8.5} fill={colors.textTertiary}>
                {display(v)}
              </SvgText>
            </G>
          ))}

          {/* Boundary line (forecast vs actual) */}
          {forecastDays > 0 && (
            <Line x1={xOf(totalDays)} x2={xOf(totalDays)} y1={padT} y2={h - padB}
              stroke={colors.accent} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5} />
          )}

          {/* IDEAL — dashed */}
          <Path d={pathOf(ideal)} fill="none" stroke={colors.textTertiary} strokeWidth={1.4}
            strokeDasharray="3 4" opacity={0.55} />

          {/* COMPOSITE area + line */}
          {(mode === 'composite' || mode === 'forecast') && (
            <>
              <Path d={fillOf(composite)} fill="url(#ns2-fill)" />
              <Path d={pathOf(composite)} fill="none" stroke={colors.accent} strokeWidth={2.4}
                strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* FORECAST cone */}
          {mode === 'forecast' && forecast && forecastDays > 0 && (
            <>
              <Path d={forecastBand} fill="url(#ns2-fc-stripe)" />
              <Path d={forecastPath(forecast.up)}  fill="none" stroke={colors.accent} strokeWidth={0.8} opacity={0.5} strokeDasharray="2 3" />
              <Path d={forecastPath(forecast.dn)}  fill="none" stroke={colors.accent} strokeWidth={0.8} opacity={0.5} strokeDasharray="2 3" />
              <Path d={forecastPath(forecast.mid)} fill="none" stroke={colors.accent} strokeWidth={1.6}
                opacity={0.85} strokeDasharray="4 4" strokeLinecap="round" />
              <Circle cx={xOf(visibleDays)} cy={yOf(forecast.mid[forecastDays])} r={3.5}
                fill="none" stroke={colors.accent} strokeWidth={1.5} />
            </>
          )}

          {/* PILLARS mode lines */}
          {mode === 'pillars' && pillarSeries.map((s, i) => {
            if (hidden.has(i)) return null;
            const p = pillars[i];
            return (
              <G key={i}>
                <Path d={pathOf(s)} fill="none" stroke={p.color} strokeWidth={1.8}
                  strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
                <Circle cx={xOf(totalDays)} cy={yOf(s[totalDays])} r={3} fill={p.color} />
              </G>
            );
          })}

          {/* End dot for composite */}
          {(mode === 'composite' || mode === 'forecast') && (
            <>
              <Circle cx={xOf(totalDays)} cy={yOf(composite[totalDays])} r={4.5}
                fill={colors.bg} stroke={colors.accent} strokeWidth={1.5} />
              <Circle cx={xOf(totalDays)} cy={yOf(composite[totalDays])} r={2.5} fill={colors.accent} />
            </>
          )}

          {/* SCRUBBER */}
          {scrubIdx != null && (
            <G>
              <Line x1={xOf(scrubIdx)} x2={xOf(scrubIdx)} y1={padT} y2={h - padB}
                stroke={colors.text} strokeWidth={0.8} opacity={0.6} />
              <Circle cx={xOf(scrubIdx)} cy={yOf(ideal[scrubIdx])} r={3} fill={colors.textTertiary} />
              {(mode === 'composite' || mode === 'forecast') && (
                <Circle cx={xOf(scrubIdx)} cy={yOf(composite[scrubIdx])} r={3.5} fill={colors.accent} />
              )}
              {mode === 'pillars' && pillarSeries.map((s, i) =>
                hidden.has(i) ? null
                  : <Circle key={i} cx={xOf(scrubIdx)} cy={yOf(s[scrubIdx])} r={2.5} fill={pillars[i].color} />,
              )}
            </G>
          )}

          {/* X labels */}
          <SvgText x={padL} y={h - 8} fontFamily={fonts.mono} fontSize={9}
            fill={colors.textTertiary} letterSpacing={1}>
            {range.label}
          </SvgText>
          <SvgText x={xOf(totalDays)} y={h - 8} textAnchor="middle"
            fontFamily={fonts.mono} fontSize={9} fill={colors.accent} letterSpacing={1}>
            TODAY
          </SvgText>
        </Svg>

        {/* AHEAD/BEHIND badge */}
        <View style={[
          styles.aheadBadge,
          ahead
            ? { backgroundColor: 'rgba(125,211,164,0.16)', borderColor: 'rgba(125,211,164,0.4)' }
            : { backgroundColor: 'rgba(217,197,111,0.16)', borderColor: 'rgba(217,197,111,0.4)' },
        ]}>
          <Text style={[
            styles.aheadText,
            { color: ahead ? colors.recoveryGreen : colors.warn },
          ]}>
            {ahead ? '↗' : '↘'} {Math.abs((youAtFocus / idealAtFocus - 1) * 100).toFixed(1)}% {ahead ? 'AHEAD' : 'BEHIND'}
          </Text>
        </View>
      </View>

      {/* Scrub readout */}
      {scrubIdx != null && (
        <View style={styles.scrubRow}>
          <ScrubItem label="DAY" value={scrubIdx === totalDays ? 'TODAY' : `−${totalDays - scrubIdx}d`} />
          <View style={styles.scrubDivider} />
          <ScrubItem label="YOU" value={display(youAtFocus)} color={colors.accent} />
          <ScrubItem label="IDEAL" value={display(idealAtFocus)} color={colors.textSecondary} />
          <ScrubItem label="GAP" value={`${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}%`}
            color={ahead ? colors.recoveryGreen : colors.warn} />
        </View>
      )}

      {/* PILLAR legend (pillars mode only) */}
      {mode === 'pillars' && (
        <View style={styles.pillarLegend}>
          {pillars.map((p, i) => {
            const off = hidden.has(i);
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.85}
                onPress={() => {
                  setHidden(prev => {
                    const next = new Set(prev);
                    next.has(i) ? next.delete(i) : next.add(i);
                    return next;
                  });
                }}
                style={[
                  styles.legendChip,
                  {
                    backgroundColor: off ? 'transparent' : `${p.color}1A`,
                    borderColor: off ? colors.line : `${p.color}66`,
                    opacity: off ? 0.42 : 1,
                  },
                ]}
              >
                <View style={[styles.legendBar, { backgroundColor: p.color }]} />
                <Text style={[styles.legendText, { color: off ? colors.textTertiary : colors.text }]}>
                  {p.short}
                </Text>
                <Text style={[styles.legendVal, { color: off ? colors.textTertiary : p.color }]}>
                  {fmtMult(pillarSeries[i][totalDays])}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Composite legend */}
      {mode !== 'pillars' && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={styles.legendSwatchSolid} />
            <Text style={styles.legendLabel}>YOUR PATH</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendSwatchDashed} />
            <Text style={styles.legendLabel}>1% IDEAL</Text>
          </View>
          {mode === 'forecast' && (
            <View style={styles.legendItem}>
              <View style={styles.legendSwatchForecast} />
              <Text style={styles.legendLabel}>FORECAST</Text>
            </View>
          )}
        </View>
      )}

      {/* STAT STRIP */}
      <View style={styles.statRow}>
        <StatCell label="NOW" value={fmtMult(last)} sub={`VS ${fmtMult(lastIdeal)} IDEAL`} accent />
        <StatCellDivider />
        <StatCell
          label="VELOCITY"
          value={velocity != null ? `${(velocity * 100).toFixed(0)}%` : '—'}
          sub="ANNUALIZED 30D"
        />
        <StatCellDivider />
        <StatCell
          label="STREAK"
          value={`${streak}`}
          unit="d"
          sub="ABOVE PACE"
        />
        <StatCellDivider />
        <StatCell
          label="1Y PROJ"
          value={velocity != null ? fmtMult(Math.pow(1 + (velocity / 365), 365)) : '—'}
          sub="AT CURRENT PACE"
        />
      </View>

      <Text style={styles.footer}>
        {scrubIdx != null ? 'RELEASE TO RESET' : 'DRAG TO SCRUB · TAP MODES TO SWITCH VIEW'}
      </Text>
    </View>
  );
}

function ScrubItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ minWidth: 56 }}>
      <Text style={styles.scrubLabel}>{label}</Text>
      <Text style={[styles.scrubVal, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function StatCell({ label, value, unit, sub, accent }: { label: string; value: string; unit?: string; sub: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 10 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: colors.accent }]}>
        {value}
        {unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

function StatCellDivider() {
  return <View style={styles.statDivider} />;
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  rangePillBar: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(15,15,24,0.6)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  rangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  rangeBtnActive: { backgroundColor: colors.accent },
  rangeBtnText: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    color: colors.textSecondary,
    letterSpacing: 1.4,
  },
  unitBar: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(15,15,24,0.6)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  unitBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    minWidth: 26,
    borderRadius: 8,
    alignItems: 'center',
  },
  unitBtnActive: { backgroundColor: colors.textSecondary },
  unitBtnText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },

  modeRow: {
    flexDirection: 'row',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  modeBtnActive: { borderBottomColor: colors.accent },
  modeBtnText: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    letterSpacing: 1.8,
  },

  aheadBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  aheadText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },

  scrubRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15,15,24,0.6)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  scrubDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.line,
  },
  scrubLabel: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  scrubVal: {
    fontFamily: fonts.monoMedium,
    fontSize: 14,
    color: colors.text,
    marginTop: 2,
  },

  pillarLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  legendBar: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  legendText: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  legendVal: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
  },

  legend: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatchSolid: {
    width: 14,
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  legendSwatchDashed: {
    width: 14,
    height: 0,
    borderTopWidth: 1.5,
    borderTopColor: colors.textTertiary,
    borderStyle: 'dashed',
  },
  legendSwatchForecast: {
    width: 14,
    height: 0,
    borderTopWidth: 1.5,
    borderTopColor: colors.accent,
    borderStyle: 'dashed',
  },
  legendLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
  },

  statRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.line,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  statValue: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.4,
    marginTop: 4,
    lineHeight: 24,
  },
  statUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    fontStyle: 'normal',
  },
  statSub: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginTop: 3,
  },

  footer: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    marginTop: 10,
    textAlign: 'center',
  },
});
