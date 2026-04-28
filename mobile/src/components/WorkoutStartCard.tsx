/**
 * WorkoutStartCard — pre-session card: kind badge + metrics + optional preview list
 * + coach note + START CTA.
 * Ported from `tabs.jsx` `WorkoutStartCard` in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme';

export type WorkoutKind = 'run' | 'lift';

export interface MetricCell {
  v: string;
  u: string;
}

export interface PreviewLine {
  x: string;
  s: string;
}

interface Props {
  kind: WorkoutKind;
  /** "07:00 AM" — top-line context. */
  time: string;
  /** Card title, e.g. "Easy run · Z2". */
  title: string;
  /** Up to ~3 metric cells: { v: '5.2', u: 'km' }. */
  metrics: MetricCell[];
  /** Optional preview list (lifts), e.g. [{ x: 'Bench press', s: '4×6 · 185' }]. */
  preview?: PreviewLine[];
  /** Optional coach note, italic. */
  note?: string;
  /** Tap handler for the primary CTA. */
  onStart: () => void;
  /** Override CTA label. Default infers from `kind`. */
  ctaLabel?: string;
}

export default function WorkoutStartCard({
  kind,
  time,
  title,
  metrics,
  preview,
  note,
  onStart,
  ctaLabel,
}: Props) {
  const isRun = kind === 'run';
  const cta = ctaLabel ?? `▶ START ${isRun ? 'RUN' : 'LIFT'}`;

  return (
    <View style={styles.wrap}>
      {/* Head */}
      <View style={styles.head}>
        <View style={styles.iconBox}>
          <Ionicons
            name={isRun ? 'walk-outline' : 'barbell-outline'}
            size={20}
            color={colors.accent}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>{isRun ? 'RUN' : 'LIFT'}</Text>
            <Text style={styles.eyebrowSep}>·</Text>
            <Text style={styles.eyebrow}>{time}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>

      {/* Metrics */}
      <View style={styles.metrics}>
        {metrics.map((m, i) => (
          <View
            key={i}
            style={[
              styles.metricCell,
              i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: 14 },
            ]}
          >
            <Text style={styles.metricLabel}>{m.u.replace('/', '').toUpperCase() || '—'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
              <Text style={styles.metricVal}>{m.v}</Text>
              <Text style={styles.metricUnit}>{m.u}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Preview list (lifts) */}
      {preview && preview.length > 0 && (
        <View style={styles.preview}>
          {preview.map((p, i) => (
            <View
              key={i}
              style={[
                styles.previewRow,
                { borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed' },
              ]}
            >
              <Text style={[styles.previewName, !p.s && { fontStyle: 'italic', color: colors.textTertiary }]}>
                {p.x}
              </Text>
              <Text style={styles.previewSet}>{p.s}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Coach note */}
      {note && (
        <View style={styles.noteRow}>
          <Text style={styles.noteEyebrow}>↗ COACH</Text>
          <Text style={styles.noteText}>{note}</Text>
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity onPress={onStart} activeOpacity={0.85} style={styles.cta}>
        <Text style={styles.ctaText}>{cta}</Text>
        <Text style={[styles.ctaText, { opacity: 0.6 }]}>→</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginBottom: 12,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  head: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(155,138,232,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(155,138,232,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrowRow: { flexDirection: 'row', gap: 8, marginBottom: 3 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  eyebrowSep: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
  },
  title: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    lineHeight: 20,
  },
  metrics: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  metricCell: {
    flex: 1,
    flexDirection: 'column',
  },
  metricLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  metricVal: {
    fontFamily: fonts.mono,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  metricUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
  },
  preview: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  previewName: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.text,
  },
  previewSet: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
  },
  noteRow: {
    paddingTop: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  noteEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accent,
    letterSpacing: 1.6,
    marginTop: 2,
    flexShrink: 0,
  },
  noteText: {
    fontFamily: fonts.serifItalic,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    flex: 1,
  },
  cta: {
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.bg,
    letterSpacing: 2.2,
  },
});
