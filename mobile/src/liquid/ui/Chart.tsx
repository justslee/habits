/**
 * The compounding chart.
 *
 * Drawn in SVG against the real growth model. Scrubbing is a horizontal drag that defers to
 * vertical scrolling until horizontal intent is clear, with a selection tick at each new date,
 * throttled so a fast drag does not buzz. Every gesture has a visible equivalent: stepper
 * buttons move the date one day at a time, and VoiceOver gets increment/decrement actions.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { fonts, gesture } from '../tokens';
import { feel } from '../haptics';
import { Small } from './Text';
import { Unit, axisLabel, formatIndex, toAxis } from '../growth';

export interface ChartLine {
  key: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
  /** Draw a soft area under this line. */
  area?: boolean;
}

export interface ChartBand {
  lo: number[];
  mid: number[];
  hi: number[];
  /** Index where the scenario starts. */
  from: number;
}

const PAD = { l: 52, r: 13, t: 27, b: 29 };

export function Chart({
  lines, band, dates, unit, start, end, focus, onFocus, compact,
}: {
  lines: ChartLine[];
  band?: ChartBand;
  dates: string[];
  unit: Unit;
  /** First and last index drawn. */
  start: number;
  end: number;
  focus: number;
  onFocus: (i: number) => void;
  compact?: boolean;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const h = compact ? 146 : 246;

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  const geom = useMemo(() => {
    if (width < 100 || end <= start) return null;
    const values: number[] = [];
    for (const l of lines) {
      for (let i = start; i <= Math.min(end, l.values.length - 1); i++) values.push(toAxis(l.values[i], unit));
    }
    if (band) {
      for (let i = 0; i < band.lo.length; i++) { values.push(toAxis(band.lo[i], unit)); values.push(toAxis(band.hi[i], unit)); }
    }
    if (!values.length) values.push(toAxis(1, unit), toAxis(1.1, unit));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.13, unit === 'mult' ? 0.04 : 1);
    const x = (i: number) => PAD.l + 4 + ((i - start) / Math.max(1, end - start)) * (width - PAD.l - PAD.r - 8);
    const y = (v: number) => (h - PAD.b) - ((v - (min - pad)) / ((max + pad) - (min - pad))) * (h - PAD.t - PAD.b);
    return { x, y, min, max, pad };
  }, [width, lines, band, start, end, unit, h]);

  const path = useCallback((values: number[], from: number, to: number) => {
    if (!geom) return '';
    const pts: string[] = [];
    for (let i = from; i <= Math.min(to, values.length - 1); i++) {
      pts.push(`${i === from ? 'M' : 'L'} ${geom.x(i).toFixed(2)} ${geom.y(toAxis(values[i], unit)).toFixed(2)}`);
    }
    return pts.join(' ');
  }, [geom, unit]);

  const step = useCallback((delta: number) => {
    const next = Math.max(start, Math.min(end, focus + delta));
    if (next !== focus) { feel.tick(); onFocus(next); }
  }, [focus, start, end, onFocus]);

  const scrubTo = useCallback((px: number) => {
    if (!geom || width < 100) return;
    const span = width - PAD.l - PAD.r - 8;
    const i = Math.round(start + ((px - PAD.l - 4) / span) * (end - start));
    const next = Math.max(start, Math.min(end, i));
    if (next !== focus) { feel.tick(); onFocus(next); }
  }, [geom, width, start, end, focus, onFocus]);

  // Horizontal intent must be clear before scrubbing takes the gesture from the page scroll.
  const pan = Gesture.Pan()
    .activeOffsetX([-gesture.horizontalIntent, gesture.horizontalIntent])
    .failOffsetY([-gesture.cancelMove, gesture.cancelMove])
    .onUpdate(e => { runOnJS(scrubTo)(e.x); })
    .onBegin(e => { runOnJS(scrubTo)(e.x); });

  const focusDate = dates[focus];
  const readout = lines
    .filter(l => focus < l.values.length)
    .map(l => ({ label: l.label, value: formatIndex(l.values[focus], unit), color: l.color }));
  const scenarioValue = band && focus >= band.from ? band.mid[focus - band.from] : null;

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Compounding chart"
          accessibilityValue={{ text: `${prettyDate(focusDate)}, ${readout.map(r => `${r.label} ${r.value}`).join(', ')}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          {geom && width > 100 ? (
            <Svg width={width} height={h}>
              <Defs>
                <LinearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={c.accent} stopOpacity="0.14" />
                  <Stop offset="1" stopColor={c.accent} stopOpacity="0.01" />
                </LinearGradient>
              </Defs>

              <Rect
                x={PAD.l} y={PAD.t}
                width={width - PAD.l - PAD.r} height={h - PAD.t - PAD.b}
                fill="none" stroke={c.line} strokeWidth={0.6}
              />
              {[geom.min, (geom.min + geom.max) / 2, geom.max].map((v, i) => (
                <G key={`y${i}`}>
                  <Line x1={PAD.l} x2={width - PAD.r} y1={geom.y(v)} y2={geom.y(v)} stroke={c.line} strokeWidth={0.65} />
                  <SvgText
                    x={PAD.l - 9} y={geom.y(v) + 4} textAnchor="end"
                    fontSize={11} fontFamily={fonts.regular} fill={c.muted}
                  >
                    {axisLabel(v, unit)}
                  </SvgText>
                </G>
              ))}
              {[start, Math.round((start + end) / 2), end].map((d, i) => (
                <SvgText
                  key={`x${i}`}
                  x={geom.x(d)} y={h - 10}
                  textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                  fontSize={11} fontFamily={fonts.regular} fill={c.muted}
                >
                  {prettyDate(dates[d])}
                </SvgText>
              ))}
              <SvgText x={PAD.l} y={14} fontSize={11} fontFamily={fonts.regular} fill={c.muted}>
                {unit === 'mult' ? 'Growth index (×)' : unit === 'pct' ? 'Growth (%)' : 'Equiv. 1% days'}
              </SvgText>
              <SvgText x={width - PAD.r} y={14} textAnchor="end" fontSize={11} fontFamily={fonts.regular} fill={c.muted}>
                Date
              </SvgText>

              {band ? (
                <>
                  <Path d={bandPath(band, geom, unit)} fill={c.accent} fillOpacity={0.13} />
                  <Path
                    d={shiftPath(band.mid, band.from, geom, unit)}
                    fill="none" stroke={c.accent} strokeWidth={1.6} strokeDasharray="5 4"
                  />
                  <Line
                    x1={geom.x(band.from)} x2={geom.x(band.from)} y1={PAD.t} y2={h - PAD.b}
                    stroke={c.line} strokeDasharray="2 4"
                  />
                </>
              ) : null}

              {lines.map(l => (
                <G key={l.key}>
                  {l.area && path(l.values, start, end) ? (
                    <Path
                      d={`${path(l.values, start, end)} L ${geom.x(Math.min(end, l.values.length - 1))} ${h - PAD.b} L ${geom.x(start)} ${h - PAD.b} Z`}
                      fill="url(#chart-area)"
                    />
                  ) : null}
                  <Path
                    d={path(l.values, start, end)}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={l.dashed ? 1.2 : 2.15}
                    strokeDasharray={l.dashed ? '2 5' : undefined}
                    strokeLinecap="round"
                  />
                </G>
              ))}

              <Line x1={geom.x(focus)} x2={geom.x(focus)} y1={PAD.t} y2={h - PAD.b} stroke={c.muted} strokeOpacity={0.55} strokeWidth={0.7} />
              {lines.filter(l => focus < l.values.length).map(l => (
                <Circle
                  key={l.key}
                  cx={geom.x(focus)} cy={geom.y(toAxis(l.values[focus], unit))}
                  r={3.6} fill={l.color} stroke={c.panel} strokeWidth={2}
                />
              ))}
              {scenarioValue != null ? (
                <Circle cx={geom.x(focus)} cy={geom.y(toAxis(scenarioValue, unit))} r={4} fill={c.accent} />
              ) : null}
            </Svg>
          ) : (
            <View style={{ height: h }} />
          )}
        </View>
      </GestureDetector>

      <View style={s.readout}>
        <Small style={{ color: c.muted }}>
          {prettyDate(focusDate)}{scenarioValue != null ? ' · scenario' : ''}
        </Small>
        <View style={s.readoutValues}>
          {readout.length ? readout.map(r => (
            <Small key={r.label}>
              {r.label} <Small style={{ color: c.fg, fontFamily: fonts.medium, fontSize: 12 }}>{r.value}</Small>
            </Small>
          )) : <Small>No lines selected</Small>}
        </View>
      </View>

      <View style={s.scrub}>
        <Small>Explore a date</Small>
        <View style={s.steppers}>
          <Pressable accessibilityRole="button" accessibilityLabel="Earlier day" onPress={() => step(-1)} hitSlop={8} style={s.stepBtn}>
            <Ionicons name="chevron-back" size={16} color={c.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Later day" onPress={() => step(1)} hitSlop={8} style={s.stepBtn}>
            <Ionicons name="chevron-forward" size={16} color={c.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function bandPath(band: ChartBand, geom: { x: (i: number) => number; y: (v: number) => number }, unit: Unit): string {
  const up = band.hi.map((v, i) => `${i === 0 ? 'M' : 'L'} ${geom.x(band.from + i).toFixed(2)} ${geom.y(toAxis(v, unit)).toFixed(2)}`);
  const down = [...band.lo].reverse().map((v, i) => {
    const idx = band.from + (band.lo.length - 1 - i);
    return `L ${geom.x(idx).toFixed(2)} ${geom.y(toAxis(v, unit)).toFixed(2)}`;
  });
  return `${up.join(' ')} ${down.join(' ')} Z`;
}

function shiftPath(values: number[], from: number, geom: { x: (i: number) => number; y: (v: number) => number }, unit: Unit): string {
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${geom.x(from + i).toFixed(2)} ${geom.y(toAxis(v, unit)).toFixed(2)}`)
    .join(' ');
}

export function prettyDate(iso?: string): string {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const s = StyleSheet.create({
  readout: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 7, minHeight: 30 },
  readoutValues: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  scrub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  steppers: { flexDirection: 'row', gap: 6 },
  stepBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
});
