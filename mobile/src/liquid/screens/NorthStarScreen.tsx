/**
 * North Star — the long view, in three parts: Compound, Vision and Discipline.
 *
 * Compound is the landing view and holds the chart; Daily deliberately has no chart. Every
 * number here comes from a real record: logged sessions drive the growth model (see growth.ts),
 * concept trees drive mastery progress, and the vision record supplies the mantra, targets and
 * anti-goals. Nothing is seeded, and the forecast is labelled a scenario.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  ConceptTreeData, DailySummaryData, DashboardStats, HeatmapDay, VisionData,
  getDailySummary, getDashboardStats, getHeatmap, getPillarConcepts, getVision,
} from '../../api/client';
import { useTheme } from '../theme';
import { fonts, gesture, radius } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';
import { Unit, buildGrowth, formatIndex, rebase, scenario } from '../growth';
import { Body, Em, Eyebrow, SectionHeading, Small, Title } from '../ui/Text';
import { Button, InlineButton, Options } from '../ui/Button';
import { DetailRow, Notice, Panel, Section } from '../ui/Surfaces';
import { Chart, ChartLine, prettyDate } from '../ui/Chart';
import { Heatmap } from '../ui/Heatmap';
import { AuroraHero } from '../ui/AuroraHero';
import { useSheet } from '../ui/Sheet';
import { Screen } from '../ui/Screen';

type View3 = 'compound' | 'vision' | 'discipline';
const VIEWS: View3[] = ['compound', 'vision', 'discipline'];
const RANGES = ['30', '90', '1y', 'all'] as const;
const RANGE_LABEL: Record<string, string> = { 30: '30D', 90: '90D', '1y': '1Y', all: 'All' };
const MODES = ['composite', 'pillars', 'forecast'] as const;
const UNITS: Unit[] = ['mult', 'pct', 'days'];
const UNIT_LABEL: Record<Unit, string> = { mult: '×', pct: '%', days: 'eq. days' };

interface PillarView {
  id: number;
  name: string;
  short: string;
  hours: number;
  entries: number;
  mastered: number;
  total: number;
  pct: number;
  level: number;
  target: string | null;
  color: string;
}

export default function NorthStarScreen({ navigation }: any) {
  const { c, moves } = useTheme();
  const sheet = useSheet();

  const [view, setView] = useState<View3>('compound');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<HeatmapDay[]>([]);
  const [vision, setVision] = useState<VisionData | null>(null);
  const [summary, setSummary] = useState<DailySummaryData | null>(null);
  const [trees, setTrees] = useState<Map<number, ConceptTreeData>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  const [range, setRange] = useState<string>('90');
  const [mode, setMode] = useState<string>('composite');
  const [unit, setUnit] = useState<Unit>('mult');
  const [hidden, setHidden] = useState<string[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const [heat, setHeat] = useState<number | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [openTarget, setOpenTarget] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [focused, setFocused] = useState(true);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const load = useCallback(async () => {
    const [s, h, v, d] = await Promise.allSettled([
      getDashboardStats(), getHeatmap(365), getVision(), getDailySummary(),
    ]);
    if (s.status === 'fulfilled') {
      setStats(s.value);
      const ids = s.value.pillar_breakdown.map(p => p.pillar_id);
      const treeResults = await Promise.allSettled(ids.map(id => getPillarConcepts(id)));
      const next = new Map<number, ConceptTreeData>();
      treeResults.forEach((r, i) => { if (r.status === 'fulfilled') next.set(ids[i], r.value); });
      setTrees(next);
    }
    if (h.status === 'fulfilled') setHistory(h.value);
    if (v.status === 'fulfilled') setVision(v.value);
    if (d.status === 'fulfilled') setSummary(d.value);
  }, []);

  useEffect(() => { load(); }, [load]);

  const growth = useMemo(() => buildGrowth(history), [history]);
  const lastIndex = Math.max(0, growth.days - 1);
  const today = focus ?? lastIndex;
  const heatIndex = heat ?? Math.max(0, history.length - 1);

  const pillars = useMemo<PillarView[]>(() => {
    if (!stats) return [];
    return stats.pillar_breakdown.map((p, i) => {
      const tree = trees.get(p.pillar_id);
      const total = tree?.total ?? 0;
      const mastered = tree?.mastered ?? 0;
      const level = tree
        ? Math.max(0, ...tree.tiers.filter(t => t.concepts.some(x => x.status === 'mastered')).map(t => t.tier))
        : 0;
      return {
        id: p.pillar_id,
        name: p.pillar_name,
        short: p.pillar_name.length > 11 ? `${p.pillar_name.slice(0, 10)}…` : p.pillar_name,
        hours: p.total_hours,
        entries: p.entry_count,
        mastered,
        total,
        pct: total ? Math.round((mastered / total) * 100) : 0,
        level,
        target: vision?.pillar_targets?.[p.pillar_name] ?? null,
        color: c.pillars[i % 5],
      };
    });
  }, [stats, trees, vision, c]);

  const goView = useCallback((v: View3) => {
    if (v === view) return;
    feel.selection();
    setView(v);
  }, [view]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-gesture.horizontalIntent, gesture.horizontalIntent])
    .failOffsetY([-gesture.cancelMove, gesture.cancelMove])
    .onEnd(e => {
      if (Math.abs(e.translationX) > gesture.commit && Math.abs(e.translationX) > Math.abs(e.translationY) * 1.3) {
        const i = VIEWS.indexOf(view);
        const next = VIEWS[Math.max(0, Math.min(2, i + (e.translationX < 0 ? 1 : -1)))];
        runOnJS(goView)(next);
      }
    });

  const auroraInfo = useCallback(() => {
    sheet.open('A sky worth looking up to.', () => (
      <View>
        <Body>
          An AI-generated photographic aurora image, with gentle layered motion. This is a moving
          still, not a captured aurora video.
        </Body>
        <Body style={{ marginTop: 14 }}>
          Motion pauses when you leave this screen, under Reduce Motion or Quiet, and when you press
          pause. The text never moves.
        </Body>
      </View>
    ));
  }, [sheet]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const heroTitle = view === 'vision'
    ? (vision?.vision_text
      ? <>{vision.vision_text}</>
      : <>Become someone who has compounded for so long that <Em style={{ color: '#b9e5d0' }}>ten years from today</Em> the difference is undeniable.</>)
    : view === 'compound'
      ? <>Time, working{'\n'}<Em style={{ color: '#b9e5d0' }}>in your favor.</Em></>
      : <>Keep showing up.{'\n'}<Em style={{ color: '#b9e5d0' }}>It adds up.</Em></>;

  return (
    <Screen contextKey={`north-${view}`} edgeToEdge onRefresh={refresh} refreshing={refreshing} style={{ paddingTop: 0 }}>
      <AuroraHero
        compact={view !== 'vision'}
        titleLength={view === 'vision' ? (vision?.vision_text?.length ?? 0) : 0}
        eyebrow={view === 'vision' ? `Your direction · Day ${String(Math.max(1, growth.days - growth.firstActive)).padStart(3, '0')}` : undefined}
        caption={view === 'vision' ? 'To me first. And the world second.' : undefined}
        title={heroTitle}
        playing={playing}
        onTogglePlay={() => setPlaying(p => !p)}
        onInfo={auroraInfo}
        focused={focused}
      />

      <View style={s.body}>
        <GestureDetector gesture={swipe}>
          <View>
            <ViewNav view={view} onChange={goView} />
          </View>
        </GestureDetector>

        {view === 'compound' ? (
          <Compound
            growth={growth} history={history} stats={stats} pillars={pillars}
            range={range} setRange={setRange} mode={mode} setMode={setMode}
            unit={unit} setUnit={setUnit} hidden={hidden} setHidden={setHidden}
            focus={today} setFocus={setFocus} heat={heatIndex} setHeat={setHeat}
            navigation={navigation}
          />
        ) : view === 'vision' ? (
          <Vision
            pillars={pillars} stats={stats} growth={growth} vision={vision}
            targetsOpen={targetsOpen} setTargetsOpen={setTargetsOpen}
            openTarget={openTarget} setOpenTarget={setOpenTarget}
            onPillarChart={(id: number) => {
              setMode('pillars');
              setHidden(pillars.filter(p => p.id !== id).map(p => String(p.id)));
              setView('compound');
            }}
          />
        ) : (
          <Discipline
            summary={summary} history={history} stats={stats}
            heat={heatIndex} setHeat={setHeat} navigation={navigation}
          />
        )}
      </View>
    </Screen>
  );
}

/** The three-way segment strip, with a well that slides between positions. */
function ViewNav({ view, onChange }: { view: View3; onChange: (v: View3) => void }) {
  const { c, moves } = useTheme();
  const [width, setWidth] = useState(0);
  const pos = useSharedValue(VIEWS.indexOf(view));

  useEffect(() => { pos.value = withTiming(VIEWS.indexOf(view), m(moves, T.selection)); }, [view, moves, pos]);

  const cell = width > 0 ? (width - 10) / 3 : 0;
  const well = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * cell }] }));

  return (
    <View
      style={[s.nav, { backgroundColor: c.panel }]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      <Animated.View pointerEvents="none" style={[s.well, { width: cell, backgroundColor: c.soft }, well]} />
      {VIEWS.map(v => (
        <Pressable
          key={v}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === v }}
          onPress={() => onChange(v)}
          style={s.navBtn}
        >
          <Animated.Text style={[s.navLabel, { color: view === v ? c.fg : c.muted }]}>
            {v[0].toUpperCase() + v.slice(1)}
          </Animated.Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Three numbers in a row above a rule. */
function StatStrip({ items }: { items: { label: string; value: string; unit?: string; sub: string }[] }) {
  const { c } = useTheme();
  return (
    <View style={[s.strip, { borderBottomColor: c.line }]}>
      {items.map(it => (
        <View key={it.label} style={{ flex: 1, gap: 5 }}>
          <Small>{it.label}</Small>
          <Animated.Text style={[s.stripValue, { color: c.fg }]}>
            {it.value}
            {it.unit ? <Animated.Text style={[s.stripUnit, { color: c.muted }]}> {it.unit}</Animated.Text> : null}
          </Animated.Text>
          <Small>{it.sub}</Small>
        </View>
      ))}
    </View>
  );
}

// --- Compound ---------------------------------------------------------------

function Compound({
  growth, history, stats, pillars, range, setRange, mode, setMode, unit, setUnit,
  hidden, setHidden, focus, setFocus, heat, setHeat, navigation,
}: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const last = Math.max(0, growth.days - 1);
  const span = range === '30' ? 30 : range === '90' ? 90 : growth.days;
  const start = Math.max(0, last - span);
  const band = mode === 'forecast' && growth.days > 1 ? { ...scenario(growth), from: last } : undefined;

  // Both the record and the reference are rebased to the window, so the range shows its own growth.
  const lines: ChartLine[] = useMemo(() => {
    const out: ChartLine[] = mode === 'pillars'
      ? pillars.map((p: PillarView) => ({
        key: String(p.id), label: p.short, color: p.color,
        values: rebase(growth.byPillar.get(p.id) ?? growth.composite, start),
      }))
      : [{ key: 'composite', label: 'Your index', color: c.accent, values: rebase(growth.composite, start), area: true }];
    out.push({ key: 'reference', label: '1% reference', color: c.muted, values: rebase(growth.reference, start), dashed: true });
    return out.filter(l => !hidden.includes(l.key));
  }, [mode, pillars, growth, hidden, c, start]);

  const now = growth.composite[last] ?? 1;
  // Compared over the window in view, not the whole record.
  const windowIndex = (growth.composite[last] ?? 1) / (growth.composite[start] ?? 1);
  const windowRef = (growth.reference[last] ?? 1) / (growth.reference[start] ?? 1);
  const ahead = (windowIndex / windowRef - 1) * 100;
  const windowDays = Math.max(1, last - start);
  const windowActive = growth.counts.slice(start, last + 1).filter((x: number) => x > 0).length;
  const velocity = growth.days > 31
    ? ((growth.composite[last] / growth.composite[Math.max(0, last - 30)] - 1) * 100)
    : 0;

  const dayCells = history.map((h: HeatmapDay) => ({ date: h.date, count: h.count }));
  const recent = history.slice(-182).map((h: HeatmapDay) => ({ date: h.date, count: h.count }));

  const openDay = useCallback(() => {
    const cell = dayCells[heat];
    if (!cell) return;
    sheet.open(prettyDate(cell.date), () => (
      <View>
        <Body>{cell.count} logged {cell.count === 1 ? 'session' : 'sessions'}.</Body>
        {!cell.count ? (
          <Panel style={{ marginTop: 14, backgroundColor: c.panel }}>
            <Body>No entries on this date. Rest and unlogged work aren’t failures.</Body>
          </Panel>
        ) : null}
      </View>
    ));
  }, [dayCells, heat, sheet, c]);

  return (
    <>
      <Section title="Your compounding." trailing={<Small>{growth.days - growth.firstActive} days of record</Small>} />
      {growth.days < 2 ? (
        <Body style={{ marginBottom: 18 }}>
          No logged activity yet. The chart appears once there is a record to draw.
        </Body>
      ) : null}

      <View style={s.summary}>
        <View style={{ flex: 1 }}>
          <Small>Now · growth index</Small>
          <Animated.Text style={[s.curveValue, { color: c.fg }]}>{formatIndex(now, unit)}</Animated.Text>
        </View>
        <Small style={{ color: c.jade, maxWidth: 145, textAlign: 'right' }}>
          {windowActive} of {windowDays} days{'\n'}logged in this range
        </Small>
      </View>

      <View style={s.ranges}>
        {RANGES.map(r => (
          <Pressable
            key={r}
            accessibilityRole="button"
            accessibilityState={{ selected: range === r }}
            onPress={() => { feel.selection(); setRange(r); }}
            style={[s.range, range === r && { backgroundColor: c.soft }]}
          >
            <Animated.Text style={[s.rangeLabel, { color: range === r ? c.accent : c.muted }]}>
              {RANGE_LABEL[r]}
            </Animated.Text>
          </Pressable>
        ))}
      </View>

      <Chart
        lines={lines}
        band={band}
        dates={growth.dates}
        unit={unit}
        start={start}
        end={band ? last + band.mid.length - 1 : last}
        focus={Math.max(start, focus)}
        onFocus={setFocus}
      />

      {/* Analysis and units sit under the chart: the plot comes before its controls. */}
      <View style={[s.controls, { borderTopColor: c.line }]}>
        <View style={s.modes}>
          {MODES.map(v => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === v }}
              onPress={() => { feel.selection(); setMode(v); setHidden([]); }}
              style={[s.mode, mode === v && { borderBottomColor: c.accent }]}
            >
              <Animated.Text style={[s.modeLabel, { color: mode === v ? c.fg : c.muted }]}>
                {v[0].toUpperCase() + v.slice(1)}
              </Animated.Text>
            </Pressable>
          ))}
        </View>
        <View style={s.units}>
          <Small>Units</Small>
          {UNITS.map(u => (
            <Pressable key={u} accessibilityRole="button" accessibilityState={{ selected: unit === u }}
              onPress={() => { feel.selection(); setUnit(u); }} style={[s.unit, unit === u && { backgroundColor: c.soft }]}>
              <Animated.Text style={[s.rangeLabel, { color: unit === u ? c.accent : c.muted }]}>{UNIT_LABEL[u]}</Animated.Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={s.legend}>
        {(mode === 'pillars'
          ? pillars.map((p: PillarView) => ({ key: String(p.id), label: p.short, color: p.color }))
          : [{ key: 'composite', label: 'Your index', color: c.accent }]
        ).concat([{ key: 'reference', label: '1% reference', color: c.muted }]).map((l: any) => {
          const on = !hidden.includes(l.key);
          return (
            <Pressable
              key={l.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => { feel.selection(); setHidden(on ? [...hidden, l.key] : hidden.filter((k: string) => k !== l.key)); }}
              style={s.legendItem}
            >
              <View style={{ width: 15, height: 2, backgroundColor: l.color, opacity: on ? 1 : 0.45 }} />
              <Small style={{ opacity: on ? 1 : 0.45, textDecorationLine: on ? 'none' : 'line-through' }}>{l.label}</Small>
            </Pressable>
          );
        })}
      </View>

      <Small style={{ marginTop: 6 }}>
        {mode === 'forecast'
          ? 'Shaded area: a 30-day scenario at your recent rate, not a probability interval.'
          : `Every day with something logged earns 1%. The dashed reference is 1% every day, missed or not. Both start at 1× on ${prettyDate(growth.dates[start])}.`}
      </Small>

      <View style={[s.statsGrid, { borderTopColor: c.line }]}>
        <Stat label="30-day velocity" value={`${velocity >= 0 ? '+' : ''}${velocity.toFixed(1)}%`} sub="Index change" />
        <Stat label="Longest streak" value={`${Math.max(0, ...(stats?.streaks ?? []).map((x: any) => x.current_streak))} days`} sub="Current, any pillar" />
        <Stat label="1-year scenario" value={`${Math.pow(1 + growth.rate30, 365).toFixed(1)}×`} sub="From 1× at this rate" />
        <Stat label="All time" value={formatIndex(now, unit)} sub={`${growth.activeDays} days logged`} />
      </View>

      <Section title="What feeds the line." />
      <View style={s.surfaces}>
        <Surface label="Deep work" value={`${(stats?.hours.this_week ?? 0).toFixed(1)} h`} sub="this week" onPress={() => navigation.navigate('Me')} />
        <Surface label="Mastery" value={`${pillars.reduce((n: number, p: PillarView) => n + p.mastered, 0)}`} sub="concepts mastered" />
        <Surface label="Logged days" value={`${history.filter((h: HeatmapDay) => h.count > 0).length}`} sub={`of ${history.length}`} />
        <Surface label="Speaking" value={stats?.pillar_breakdown.find((p: any) => /speak/i.test(p.pillar_name))?.entry_count?.toString() ?? '—'} sub="sessions logged" onPress={() => navigation.navigate('Speak')} />
      </View>

      <Section title="A record of showing up." trailing={<Small>6 months</Small>} />
      <Heatmap
        cells={recent}
        label="26 weeks · logged sessions"
        selected={Math.max(0, Math.min(recent.length - 1, heat - (history.length - recent.length)))}
        onSelect={(i: number) => setHeat(i + (history.length - recent.length))}
        onOpenDay={openDay}
      />
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  const { c } = useTheme();
  return (
    <View style={{ width: '46%' }}>
      <Small>{label}</Small>
      <Animated.Text style={[s.statValue, { color: c.fg }]}>{value}</Animated.Text>
      <Small>{sub}</Small>
    </View>
  );
}

function Surface({ label, value, sub, onPress }: { label: string; value: string; sub: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress ? () => { feel.selection(); onPress(); } : undefined}
      style={[s.surface, { backgroundColor: c.panel }]}
    >
      <Small>{label}</Small>
      <Animated.Text style={[s.surfaceValue, { color: c.fg }]}>{value}</Animated.Text>
      <Small>{sub}</Small>
    </Pressable>
  );
}

// --- Vision -----------------------------------------------------------------

function Vision({
  pillars, stats, growth, vision, targetsOpen, setTargetsOpen, openTarget, setOpenTarget, onPillarChart,
}: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const best = Math.max(0, ...(stats?.streaks ?? []).map((x: any) => x.longest_streak));
  const current = Math.max(0, ...(stats?.streaks ?? []).map((x: any) => x.current_streak));

  const openPillar = useCallback((p: PillarView) => {
    sheet.open(p.name, () => (
      <View>
        <Eyebrow>{p.total ? `${p.mastered} of ${p.total} concepts` : 'No concept tree yet'}</Eyebrow>
        <StatStrip items={[
          { label: 'Level', value: String(p.level), sub: 'Deepest tier reached' },
          { label: 'Progress', value: String(p.pct), unit: '%', sub: 'Concepts mastered' },
          { label: 'Deep work', value: p.hours.toFixed(0), unit: 'h', sub: `${p.entries} entries` },
        ]} />
        {p.target ? (
          <>
            <Section title="What mastery looks like." />
            <Body>{p.target}</Body>
          </>
        ) : <Body>No target written for this pillar yet.</Body>}
        <Button
          full
          label="See this pillar’s trajectory"
          style={{ marginTop: 22 }}
          onPress={() => { sheet.close(); onPillarChart(p.id); }}
        />
      </View>
    ));
  }, [sheet, onPillarChart]);

  return (
    <>
      <StatStrip items={[
        { label: 'Growth index', value: formatIndex(growth.composite[growth.days - 1] ?? 1, 'mult'), sub: 'Against a 1% day' },
        { label: 'Current streak', value: String(current), unit: 'days', sub: `Personal best · ${best}d` },
        { label: 'Deep work', value: (stats?.hours.all_time ?? 0).toFixed(0), unit: 'h', sub: 'Lifetime hours' },
      ]} />

      <Section title="Five ways to grow." trailing={<Small>Real records</Small>} />
      <View style={s.pillarGrid}>
        {pillars.map((p: PillarView, i: number) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, level ${p.level}, ${p.pct} percent, ${p.hours.toFixed(0)} hours. Open details.`}
            onPress={() => { feel.selection(); openPillar(p); }}
            onLongPress={() => { feel.soft(); openPillar(p); }}
            delayLongPress={500}
            style={[s.pillar, { backgroundColor: c.panel }, i === pillars.length - 1 && { width: '100%' }]}
          >
            <View style={s.pillarTop}>
              <Animated.Text style={[s.pillarName, { color: c.fg }]} numberOfLines={1}>{p.short}</Animated.Text>
              <Animated.Text style={[s.pillarLevel, { color: p.color }]}>L{p.level}</Animated.Text>
            </View>
            <Animated.Text style={[s.pillarValue, { color: c.fg }]}>
              {p.pct}<Animated.Text style={[s.pillarPct, { color: c.muted }]}>%</Animated.Text>
            </Animated.Text>
            <View style={[s.track, { backgroundColor: c.panel2 }]}>
              <View style={{ width: `${p.pct}%`, height: '100%', borderRadius: 4, backgroundColor: p.color }} />
            </View>
            <Small>{p.hours.toFixed(0)}h · {p.entries} entries</Small>
          </Pressable>
        ))}
      </View>

      <Section
        title="What mastery looks like."
        trailing={<InlineButton label={targetsOpen ? 'Collapse' : 'Expand all'} onPress={() => { setTargetsOpen(!targetsOpen); setOpenTarget(null); }} />}
      />
      <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
        {pillars.map((p: PillarView) => {
          const open = targetsOpen || openTarget === p.id;
          return (
            <View key={p.id} style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => { feel.selection(); setOpenTarget(open ? null : p.id); setTargetsOpen(false); }}
                style={s.targetRow}
              >
                <View style={{ flex: 1 }}>
                  <Animated.Text style={[s.detailLabel, { color: c.fg }]}>{p.name}</Animated.Text>
                  <Small style={{ marginTop: 3 }}>{p.total ? `${p.mastered}/${p.total} concepts` : 'No tree yet'}</Small>
                </View>
                <Ionicons name="add" size={16} color={c.muted} style={{ transform: [{ rotate: open ? '45deg' : '0deg' }] }} />
              </Pressable>
              {open ? <Body style={{ paddingBottom: 16, lineHeight: 12 * 1.65 }}>{p.target ?? 'No target written yet.'}</Body> : null}
            </View>
          );
        })}
      </View>

      <Section title="The lines I won’t cross." />
      <Panel>
        {(vision?.anti_goals ?? []).length
          ? vision!.anti_goals!.map((t: string) => (
            <View key={t} style={s.antiRow}>
              <Ionicons name="remove" size={14} color={c.warm} style={{ marginTop: 3 }} />
              <Small style={{ flex: 1, fontSize: 12, lineHeight: 12 * 1.5 }}>{t}</Small>
            </View>
          ))
          : <Small>No anti-goals written yet.</Small>}
      </Panel>
    </>
  );
}

// --- Discipline -------------------------------------------------------------

function Discipline({ summary, history, stats, heat, setHeat, navigation }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const habits = summary?.habits ?? [];
  const kept = habits.filter((h: any) => h.completed_today).length;
  const pct = habits.length ? Math.round((kept / habits.length) * 100) : 0;
  const grade = pct >= 95 ? 'A+' : pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
  const last30 = history.slice(-30);
  const cells = history.slice(-91).map((h: HeatmapDay) => ({ date: h.date, count: h.count }));
  const best = Math.max(0, ...(stats?.streaks ?? []).map((x: any) => x.longest_streak));
  const current = Math.max(0, ...(stats?.streaks ?? []).map((x: any) => x.current_streak));
  const bestHabit = [...habits].sort((a: any, b: any) => b.current_streak - a.current_streak)[0];

  return (
    <>
      <Section title="Today’s discipline." />
      <View style={s.disciplineRow}>
        <View>
          <Animated.Text style={[s.count, { color: c.fg }]}>
            {kept}<Animated.Text style={[s.countUnit, { color: c.muted }]}> / {habits.length}</Animated.Text>
          </Animated.Text>
          <Small>Rituals completed today · {pct}%</Small>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Small>Today’s grade</Small>
          <Animated.Text style={[s.grade, { color: c.fg }]}>{grade}</Animated.Text>
          <Small>Day still in progress</Small>
        </View>
      </View>

      <StatStrip items={[
        { label: 'Current', value: String(current), unit: 'd', sub: 'Activity streak' },
        { label: 'Best', value: String(best), unit: 'd', sub: 'All time' },
        { label: 'Longest active', value: String(bestHabit?.current_streak ?? 0), unit: 'd', sub: bestHabit?.name ?? '—' },
      ]} />

      <Section title="Consistency, made visible." />
      <Panel style={{ borderRadius: 19, padding: 17 }}>
        <View style={s.row}>
          <Small>Last 30 days · logged activity</Small>
          <Small>{last30.filter((d: HeatmapDay) => d.count > 0).length} active</Small>
        </View>
        <View style={s.dots}>
          {last30.map((d: HeatmapDay) => (
            <View
              key={d.date}
              style={{
                flex: 1, height: 15, borderRadius: 5,
                backgroundColor: d.count >= 3 ? c.jade : d.count ? `${c.jade}59` : c.panel2,
              }}
            />
          ))}
        </View>
        <View style={s.row}>
          <Small>{last30.filter((d: HeatmapDay) => d.count === 0).length} quiet days</Small>
          <Small>Solid = three or more</Small>
        </View>
      </Panel>

      <Section title="By habit." trailing={<Small>Today</Small>} />
      {habits.map((h: any) => (
        <View key={h.id} style={[s.habitStat, { borderBottomColor: c.line }]}>
          <View style={[s.check, { borderColor: h.completed_today ? 'transparent' : c.line, backgroundColor: h.completed_today ? c.soft : c.panel }]}>
            <Ionicons name={h.completed_today ? 'checkmark' : 'remove'} size={14} color={h.completed_today ? c.accent : c.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Animated.Text style={[s.detailLabel, { color: c.fg }]}>{h.name}</Animated.Text>
            <Small style={{ marginTop: 4 }}>
              {h.completed_today ? 'Done today' : 'Still open'} · {h.total_completions} total completions
            </Small>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Animated.Text style={[s.detailLabel, { color: c.fg }]}>{h.current_streak}d</Animated.Text>
            <Small>streak</Small>
          </View>
        </View>
      ))}

      <Section title="Activity over 90 days." />
      <Heatmap
        cells={cells}
        label="13 weeks · logged sessions"
        selected={Math.max(0, Math.min(cells.length - 1, heat - (history.length - cells.length)))}
        onSelect={(i: number) => setHeat(i + (history.length - cells.length))}
      />

      <View style={[s.nudge, { borderLeftColor: c.jade }]}>
        <Body>
          {kept === habits.length && habits.length
            ? 'Every promise kept. Leave a little energy for tomorrow.'
            : 'One small action is enough to get moving again. Pick the next ritual and make it easy.'}
        </Body>
      </View>

      <Button full label="Open weekly review" iconAfter="arrow-forward" iconAfterRotate={-45}
        onPress={() => navigation.navigate('Me')} />
      <Small style={{ marginTop: 20 }}>
        Activity counts and habit completion are separate measures.
      </Small>
    </>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 20 },
  nav: { flexDirection: 'row', padding: 5, borderBottomLeftRadius: 19, borderBottomRightRadius: 19, marginBottom: 19 },
  well: { position: 'absolute', top: 5, bottom: 5, left: 5, borderRadius: 13 },
  navBtn: { flex: 1, minHeight: 45, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  navLabel: { fontFamily: fonts.regular, fontSize: 12 },

  strip: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 25, paddingBottom: 19, borderBottomWidth: 1 },
  stripValue: { fontFamily: fonts.serif, fontSize: 29, lineHeight: 29 * 1.1, letterSpacing: -0.4 },
  stripUnit: { fontFamily: fonts.serif, fontSize: 16 },
  stripUnitGap: { fontFamily: fonts.serif, fontSize: 16 },

  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginVertical: 12 },
  curveValue: { fontFamily: fonts.serif, fontSize: 44, lineHeight: 44 * 1.05, letterSpacing: -1, marginTop: 4 },

  ranges: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  range: { borderRadius: 11, paddingVertical: 9, paddingHorizontal: 10, minHeight: 44, minWidth: 43, alignItems: 'center', justifyContent: 'center' },
  rangeLabel: { fontFamily: fonts.regular, fontSize: 11 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 8, paddingTop: 5, borderTopWidth: 1 },
  modes: { flexDirection: 'row', gap: 16 },
  mode: { minHeight: 42, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  modeLabel: { fontFamily: fonts.regular, fontSize: 11 },
  units: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unit: { borderRadius: 9, paddingVertical: 8, paddingHorizontal: 9, minHeight: 38, justifyContent: 'center' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 15, marginTop: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingVertical: 8 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, columnGap: 12, justifyContent: 'space-between', marginVertical: 22, paddingTop: 18, borderTopWidth: 1 },
  statValue: { fontFamily: fonts.serif, fontSize: 25, marginTop: 5, marginBottom: 2 },

  surfaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  surface: { width: '48%', padding: 15, borderRadius: 18, minHeight: 98, justifyContent: 'space-between', gap: 9 },
  surfaceValue: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 26 },

  pillarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pillar: { width: '48%', borderRadius: radius.card, paddingVertical: 17, paddingHorizontal: 16, overflow: 'hidden' },
  pillarTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  pillarName: { fontFamily: fonts.medium, fontSize: 12, flex: 1 },
  pillarLevel: { fontFamily: fonts.regular, fontSize: 11 },
  pillarValue: { fontFamily: fonts.serif, fontSize: 34, letterSpacing: -0.6, lineHeight: 34 * 1.3, marginTop: 11 },
  pillarPct: { fontFamily: fonts.serif, fontSize: 18 },
  track: { height: 3, borderRadius: 4, marginTop: 7, marginBottom: 10, overflow: 'hidden' },

  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 50, paddingVertical: 12 },
  detailLabel: { fontFamily: fonts.regular, fontSize: 13 },
  antiRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 },

  disciplineRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginVertical: 20 },
  count: { fontFamily: fonts.serif, fontSize: 57, lineHeight: 57, letterSpacing: -1 },
  countUnit: { fontFamily: fonts.serif, fontSize: 31 },
  grade: { fontFamily: fonts.serif, fontSize: 26 },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dots: { flexDirection: 'row', gap: 4, marginVertical: 16 },
  habitStat: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nudge: { borderLeftWidth: 2, paddingLeft: 14, marginVertical: 22 },
});
