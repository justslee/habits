/**
 * The growth model behind North Star's compounding chart.
 *
 * One model, one series, documented here, computed from real logged activity — never a seeded
 * curve. The design notes are explicit: a convincing line must not be presented as measured
 * growth unless it is.
 *
 * **The model.** A day you showed up earns 1%. A day with nothing logged earns nothing; it does
 * not decay.
 *
 *     rate(day) = DAILY_MAX × min(sessions, FULL_DAY) / FULL_DAY
 *     index(n)  = Π over days 0..n of (1 + rate(day))
 *
 * With FULL_DAY at 1, that reduces to 1.01 raised to the number of active days, so "equivalent
 * days" — log(index) / log(1.01) — is literally the number of days the record shows up on. The
 * reference line is 1.01 compounded over every elapsed day, active or not: the ideal of never
 * missing. Charts rebase both to the start of the visible window so a range shows its own
 * growth rather than a year of accumulated distance.
 *
 * The forecast is a scenario, not a confidence interval: it continues the realised rate of the
 * last 30 days, with a band of ±0.35 percentage points a day around it.
 */

import { HeatmapDay } from '../api/client';

/** Sessions in a day needed to earn the full daily rate. Showing up at all is the bar. */
export const FULL_DAY = 1;
/** The rate a full day earns, matching the 1% reference exactly. */
export const DAILY_MAX = 0.01;
/** Days of scenario drawn past today. */
export const FORECAST_DAYS = 30;
/** Daily spread of the scenario band, in rate points. */
export const SCENARIO_SPREAD = 0.0035;

export interface GrowthSeries {
  /** ISO date per index position. */
  dates: string[];
  /** The composite index, starting at 1. */
  composite: number[];
  /** The 1%-per-day reference over the same days. */
  reference: number[];
  /** Per-pillar indices, keyed by pillar id. */
  byPillar: Map<number, number[]>;
  /** Raw session counts per day. */
  counts: number[];
  /** Realised daily rate over the last 30 days. */
  rate30: number;
  /** Days covered. */
  days: number;
  /** Index of the first day with anything logged, or 0. */
  firstActive: number;
  /** Days with at least one logged session. */
  activeDays: number;
}

const rateFor = (count: number) => DAILY_MAX * Math.min(count, FULL_DAY) / FULL_DAY;

/**
 * Build every series from the heatmap. `history` must be ascending by date and gap-free;
 * the dashboard's heatmap endpoint already returns one row per day.
 */
export function buildGrowth(history: HeatmapDay[]): GrowthSeries {
  const rows = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const dates = rows.map(r => r.date);
  const counts = rows.map(r => r.count);

  const composite: number[] = [];
  const reference: number[] = [];
  let v = 1;
  rows.forEach((r, i) => {
    if (i > 0) v *= 1 + rateFor(r.count);
    composite.push(v);
    reference.push(Math.pow(1.01, i));
  });

  const pillarIds = new Set<number>();
  rows.forEach(r => r.pillars?.forEach(p => pillarIds.add(p)));
  const byPillar = new Map<number, number[]>();
  for (const id of pillarIds) {
    const series: number[] = [];
    let pv = 1;
    rows.forEach((r, i) => {
      if (i > 0 && r.pillars?.includes(id)) pv *= 1 + DAILY_MAX;
      series.push(pv);
    });
    byPillar.set(id, series);
  }

  const n = composite.length;
  const back = Math.max(0, n - 31);
  const rate30 = n > 1 && composite[back] > 0
    ? Math.pow(composite[n - 1] / composite[back], 1 / Math.max(1, n - 1 - back)) - 1
    : 0;

  const firstActiveIdx = counts.findIndex(x => x > 0);
  return {
    dates, composite, reference, byPillar, counts, rate30, days: n,
    firstActive: firstActiveIdx < 0 ? 0 : firstActiveIdx,
    activeDays: counts.filter(x => x > 0).length,
  };
}

/** The forward scenario: low, middle and high paths from today at the realised rate. */
export function scenario(g: GrowthSeries): { lo: number[]; mid: number[]; hi: number[] } {
  const last = g.composite[g.composite.length - 1] ?? 1;
  const lo: number[] = [];
  const mid: number[] = [];
  const hi: number[] = [];
  for (let i = 0; i <= FORECAST_DAYS; i++) {
    lo.push(last * Math.pow(1 + Math.max(0, g.rate30 - SCENARIO_SPREAD), i));
    mid.push(last * Math.pow(1 + g.rate30, i));
    hi.push(last * Math.pow(1 + g.rate30 + SCENARIO_SPREAD, i));
  }
  return { lo, mid, hi };
}

export type Unit = 'mult' | 'pct' | 'days';

/** Format an index value in the chosen unit. */
export function formatIndex(n: number, unit: Unit): string {
  if (unit === 'pct') return `${((n - 1) * 100).toFixed(0)}%`;
  if (unit === 'days') return `${(Math.log(n) / Math.log(1.01)).toFixed(0)}d`;
  return `${n.toFixed(2)}×`;
}

/** Convert an index value into the axis space for the chosen unit. */
export function toAxis(n: number, unit: Unit): number {
  if (unit === 'pct') return (n - 1) * 100;
  if (unit === 'days') return Math.log(n) / Math.log(1.01);
  return n;
}

export function axisLabel(v: number, unit: Unit): string {
  if (unit === 'mult') return `${v.toFixed(1)}×`;
  return `${Math.round(v)}${unit === 'pct' ? '%' : 'd'}`;
}

/**
 * Rebase a series so the window's first day reads as 1×. Both the record and the reference are
 * rebased together, so a 90-day view compares 90 days of showing up with 90 ideal days.
 */
export function rebase(values: number[], start: number): number[] {
  const base = values[start] || 1;
  return values.map(v => v / base);
}
