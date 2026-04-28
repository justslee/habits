/**
 * BrandLogo — the "Arc" app mark (variant 2B from the App Logo design canvas).
 *
 * A compounding curve sweeping from bottom-left to a north star at the upper-right,
 * with whisper-bars beneath. Renders crisp at any size — used for the topbar
 * brand mark, the splash, and (rasterized to PNG) the iOS app icon.
 *
 * Colors are oklch values from the canvas approximated to hex/rgba, since
 * react-native-svg doesn't accept oklch().
 */

import React from 'react';
import Svg, {
  Defs, LinearGradient, RadialGradient, Stop,
  Rect, Line, Path, Circle, G,
} from 'react-native-svg';

interface Props {
  /** Visual size in points. */
  size?: number;
  /** Corner radius (default 22% of size, matching iOS app-icon ratio). */
  radius?: number;
  /** Hide the rounded background tile (e.g. for inline use in a topbar). */
  bare?: boolean;
}

// oklch approximations
const COL = {
  bgTop: '#1B1A2C',     // oklch(0.20 0.04 290) — dusky violet
  bgBot: '#0E0E14',     // oklch(0.10 0.012 60)
  axis:  'rgba(102,100,95,0.5)',  // oklch(0.40 0.02 60 / 0.5)
  tick:  '#7B7872',     // oklch(0.50 0.02 60)
  amber: '#E0B775',     // oklch(0.78 0.13 65) — warm amber/gold
  amberSoft18: 'rgba(224,183,117,0.18)',
  amberSoft50: 'rgba(224,183,117,0.5)',
  amberSoft70: 'rgba(224,183,117,0.7)',
  cream: '#FFF6E0',     // oklch(0.99 0.06 80) — bright tip
  starGlow: 'rgba(224,183,117,0.5)',
  ghostBright: 'rgba(250,234,191,0.85)', // oklch(0.96 0.10 80 / 0.85)
};

export default function BrandLogo({ size = 64, radius, bare = false }: Props) {
  const r = radius ?? Math.round(size * 0.22);
  // 100x100 viewbox shared with the canvas reference
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ borderRadius: bare ? 0 : r }}
    >
      <Defs>
        <LinearGradient id="oArcBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={COL.bgTop} />
          <Stop offset="1" stopColor={COL.bgBot} />
        </LinearGradient>
        <LinearGradient id="oArcCurve" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={COL.amber} stopOpacity="0" />
          <Stop offset="0.4" stopColor={COL.amber} stopOpacity="1" />
          <Stop offset="1" stopColor={COL.cream} stopOpacity="1" />
        </LinearGradient>
        <RadialGradient id="oArcGlow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={COL.amber} stopOpacity="0.5" />
          <Stop offset="1" stopColor={COL.amber} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Background — the tile fill, suppressed in bare mode */}
      {!bare && <Rect width="100" height="100" fill="url(#oArcBg)" />}

      {/* Baseline x-axis */}
      <Line x1="14" y1="78" x2="86" y2="78" stroke={COL.axis} strokeWidth={0.6} />

      {/* Tick marks — compounding cadence */}
      {[22, 36, 50, 64, 78].map(x => (
        <Line key={x} x1={x} y1={78} x2={x} y2={81} stroke={COL.tick} strokeWidth={0.6} />
      ))}

      {/* Whisper bars beneath the curve */}
      {[
        { x: 22, h: 4 },
        { x: 36, h: 8 },
        { x: 50, h: 16 },
        { x: 64, h: 28 },
        { x: 78, h: 46 },
      ].map(({ x, h }, i) => (
        <Rect key={i} x={x - 2} y={78 - h} width={4} height={h} rx={1} fill={COL.amberSoft18} />
      ))}

      {/* Halo behind the star */}
      <Circle cx={78} cy={32} r={20} fill="url(#oArcGlow)" />

      {/* Compounding curve — quadratic crest from bottom-left up to the star */}
      <Path
        d="M 14 76 Q 30 75, 46 64 T 78 32"
        fill="none"
        stroke="url(#oArcCurve)"
        strokeWidth={2.8}
        strokeLinecap="round"
      />

      {/* Ghost-trail dots along the curve */}
      <Circle cx={22} cy={74} r={1} fill={COL.amberSoft50} />
      <Circle cx={40} cy={68} r={1.2} fill={COL.amberSoft70} />
      <Circle cx={60} cy={52} r={1.4} fill={COL.ghostBright} />

      {/* North star at the curve's terminus */}
      <G x={78} y={32}>
        <Path
          d="M0 -13 L2 -2 L13 0 L2 2 L0 13 L-2 2 L-13 0 L-2 -2 Z"
          fill={COL.cream}
        />
        <Path
          d="M0 -13 L2 -2 L13 0 L2 2 L0 13 L-2 2 L-13 0 L-2 -2 Z"
          fill={COL.cream}
          opacity={0.9}
          transform="rotate(45) scale(0.4)"
        />
      </G>

      {/* "Today" pin marker at the curve's start */}
      <Circle
        cx={14}
        cy={76}
        r={2.2}
        fill={COL.cream}
        stroke={bare ? 'transparent' : COL.bgBot}
        strokeWidth={1}
      />
    </Svg>
  );
}
