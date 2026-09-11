/**
 * The sculptural objects from the prototype, rebuilt in SVG.
 *
 * CSS conic gradients have no React Native equivalent, so the pearlescent ring is drawn as a
 * fan of narrow wedges whose colours are interpolated around the same stop list. The blobby
 * outline reproduces the prototype's asymmetric border-radius by varying the radius with angle.
 */

import React, { useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '../theme';

/** conic-gradient(from 20deg, …) stops as [position 0-1, hex]. */
const CONIC: [number, string][] = [
  [0, '#beb0d8'], [0.14, '#ece6f3'], [0.25, '#a495ba'], [0.42, '#675c86'],
  [0.52, '#c2b6da'], [0.70, '#efe9f5'], [0.86, '#b5a3cd'], [1, '#beb0d8'],
];

const hex = (h: string) => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];

function conicAt(t: number): string {
  const p = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < CONIC.length - 2 && CONIC[i + 1][0] < p) i++;
  const [p0, c0] = CONIC[i];
  const [p1, c1] = CONIC[i + 1];
  const f = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
  const a = hex(c0);
  const b = hex(c1);
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

/**
 * border-radius: 46% 54% 38% 62% / 44% 36% 64% 56% — a softly asymmetric round shape.
 * Expressed here as a radius that varies gently with angle and always fits its box.
 */
function blobRadius(angle: number, size: number): number {
  const rx = [0.46, 0.54, 0.38, 0.62];
  const ry = [0.44, 0.36, 0.64, 0.56];
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const q = Math.floor(a / (Math.PI / 2)) % 4;
  const cx = Math.abs(Math.cos(a));
  const cy = Math.abs(Math.sin(a));
  // Normalise so the largest corner reaches the edge of the box and the rest tuck in.
  const mix = (rx[q] * cx + ry[q] * cy) / 0.64;
  return (size / 2) * (0.79 + 0.17 * mix);
}

/**
 * The hero's sculptural ring. Sits behind the hero's text, clipped by the hero's own bounds.
 */
export function Sculpture({ size = 197, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const wedges = 180;
  const cx = size / 2;
  const cy = size / 2;
  const inner = size * 0.235;

  const paths = useMemo(() => {
    const out: { d: string; fill: string }[] = [];
    for (let i = 0; i < wedges; i++) {
      const t0 = i / wedges;
      const t1 = (i + 2.4) / wedges;
      const a0 = t0 * Math.PI * 2 - Math.PI / 2;
      const a1 = t1 * Math.PI * 2 - Math.PI / 2;
      const r0 = blobRadius(a0, size);
      const r1 = blobRadius(a1, size);
      const d = [
        `M ${cx} ${cy}`,
        `L ${cx + Math.cos(a0) * r0} ${cy + Math.sin(a0) * r0}`,
        `L ${cx + Math.cos(a1) * r1} ${cy + Math.sin(a1) * r1}`,
        'Z',
      ].join(' ');
      out.push({ d, fill: conicAt(t0 + 20 / 360) });
    }
    return out;
  }, [size, cx, cy]);

  // The CSS punches an elliptical hole with `inset 40px 48px` on a 197px box.
  const holeX = size * 0.256;
  const holeY = size * 0.297;

  return (
    <View pointerEvents="none" style={[{ width: size, height: size, opacity: 0.85 }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="sculpt-gloss" cx="30%" cy="22%" r="58%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
            <Stop offset="0.6" stopColor="#ffffff" stopOpacity="0.02" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="sculpt-shade" cx="72%" cy="80%" r="56%">
            <Stop offset="0" stopColor="#4b3b70" stopOpacity="0.34" />
            <Stop offset="1" stopColor="#4b3b70" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <G rotation={-28} origin={`${cx}, ${cy}`}>
          {paths.map((p, i) => (
            <Path key={i} d={p.d} fill={p.fill} />
          ))}
          {/* Highlight and shade follow the ring, not the bounding box. */}
          {paths.map((p, i) => (
            <Path key={`g${i}`} d={p.d} fill="url(#sculpt-gloss)" />
          ))}
          {paths.map((p, i) => (
            <Path key={`s${i}`} d={p.d} fill="url(#sculpt-shade)" />
          ))}
          {/* The hole, with the soft inner edge the CSS gets from its inset shadows. */}
          <Ellipse cx={cx - 2} cy={cy - 2} rx={holeX + 2} ry={holeY + 2} fill="#4a3d6b" fillOpacity={0.2} />
          <Ellipse cx={cx} cy={cy} rx={holeX} ry={holeY} fill={c.panel} />
        </G>
      </Svg>
    </View>
  );
}

/** The small assistant orb in the bar above the tab dock. */
export function Orb({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id="orb" cx="34%" cy="23%" r="82%">
          <Stop offset="0" stopColor="#f6edf8" />
          <Stop offset="0.22" stopColor="#c9b6e5" />
          <Stop offset="0.49" stopColor="#8a75ae" />
          <Stop offset="0.73" stopColor="#514864" />
          <Stop offset="0.97" stopColor="#b9a5db" />
        </RadialGradient>
      </Defs>
      <Circle cx="12" cy="12" r="12" fill="url(#orb)" />
    </Svg>
  );
}

/** Speak's large breathing orb. */
export function VoiceOrb({ size = 151 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 151 151">
      <Defs>
        <RadialGradient id="voice" cx="30%" cy="20%" r="88%">
          <Stop offset="0" stopColor="#f5edf7" />
          <Stop offset="0.21" stopColor="#cfb9e4" />
          <Stop offset="0.44" stopColor="#a88dbf" />
          <Stop offset="0.68" stopColor="#615773" />
          <Stop offset="0.91" stopColor="#b39ad3" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="75.5" cy="75.5" rx="75.5" ry="73" fill="url(#voice)" />
    </Svg>
  );
}

/** The stylised bowl on Food's cover and recipe cards. */
export function Bowl({ size = 145 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 145 145">
      <Defs>
        <RadialGradient id="broth" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#b2562e" />
          <Stop offset="0.54" stopColor="#b2562e" />
          <Stop offset="0.545" stopColor="#533325" />
          <Stop offset="0.61" stopColor="#533325" />
          <Stop offset="0.615" stopColor="#b8afa4" />
          <Stop offset="0.67" stopColor="#b8afa4" />
          <Stop offset="0.675" stopColor="#e8e2d7" />
          <Stop offset="0.74" stopColor="#e8e2d7" />
          <Stop offset="0.745" stopColor="#e8e2d7" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <G rotation={-15} origin="72.5, 72.5">
        <Circle cx="72.5" cy="72.5" r="72.5" fill="url(#broth)" />
        <Ellipse cx="64" cy="61" rx="9" ry="7" fill="#ca874d" />
        <Ellipse cx="50" cy="40" rx="8" ry="6" fill="#f2bd75" />
        <Ellipse cx="87" cy="85" rx="12" ry="9" fill="#cb703b" />
        <Ellipse cx="58" cy="87" rx="11" ry="8" fill="#df9e54" />
        <G rotation={-34} origin="62, 49">
          <Ellipse cx="62" cy="49" rx="23" ry="3.5" fill="#709567" />
          <Ellipse cx="57" cy="63" rx="23" ry="3.5" fill="#627c50" />
          <Ellipse cx="81" cy="67" rx="23" ry="3.5" fill="#759766" />
          <Ellipse cx="85" cy="52" rx="23" ry="3.5" fill="#567348" />
        </G>
      </G>
    </Svg>
  );
}

/** North Star's golden core, used by the compact orbit mark. */
export function NorthCore({ size = 83 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 83 83">
      <Defs>
        <RadialGradient id="core" cx="32%" cy="24%" r="86%">
          <Stop offset="0" stopColor="#f1dbb0" />
          <Stop offset="0.5" stopColor="#a88c61" />
          <Stop offset="1" stopColor="#6b5c49" />
        </RadialGradient>
      </Defs>
      <Circle cx="41.5" cy="41.5" r="41.5" fill="url(#core)" />
    </Svg>
  );
}
