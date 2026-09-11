/**
 * Me — your space: what Habits knows, how it looks, and where it connects.
 *
 * Appearance and motion live here, and so does the switch back to the previous frontend, so a
 * rollback is a toggle rather than a rebuild.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import {
  CalendarFeedData, DashboardStats, FoodSettingsData,
  getCalendarFeeds, getDashboardStats, getFoodSettings, getTrainProgram,
} from '../../api/client';
import { API_URL, checkHealth, setRuntimeServer } from '../../api/client';
import { loadServerSettings, saveServerSettings, normalizeServerUrl } from '../../services/settings';
import { DesignVersion, getDesignVersion, setDesignVersion } from '../version';
import { useTheme } from '../theme';
import { Appearance, MotionSetting, fonts, radius } from '../tokens';
import { feel } from '../haptics';
import { Screen } from '../ui/Screen';
import { Body, Em, Eyebrow, Small, Title } from '../ui/Text';
import { Button, Options } from '../ui/Button';
import { DetailRow, GoalRow, Notice, Section, TopBar } from '../ui/Surfaces';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const APPEARANCE_LABEL: Record<Appearance, string> = { auto: 'Follows your device', pearl: 'Soft pearl', ink: 'Deep ink' };

export default function MeScreen({ navigation }: any) {
  const { c, appearance, setAppearance, motionSetting, setMotionSetting } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [feeds, setFeeds] = useState<CalendarFeedData[]>([]);
  const [food, setFood] = useState<FoodSettingsData | null>(null);
  const [server, setServer] = useState<'checking' | 'ok' | 'stale' | 'unreachable'>('checking');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, f, fo] = await Promise.allSettled([getDashboardStats(), getCalendarFeeds(), getFoodSettings()]);
    if (s.status === 'fulfilled') setStats(s.value);
    if (f.status === 'fulfilled') setFeeds(f.value);
    if (fo.status === 'fulfilled') setFood(fo.value);

    // A reachable server that 404s a current endpoint is an old deployment, not a network fault.
    try {
      await getTrainProgram();
      setServer('ok');
    } catch (err: any) {
      setServer(/API 404/.test(String(err?.message ?? '')) ? 'stale' : 'unreachable');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const appearanceSheet = useCallback(() => {
    sheet.open('Your kind of calm.', () => (
      <AppearanceSheet
        appearance={appearance}
        setAppearance={setAppearance}
        motion={motionSetting}
        setMotion={setMotionSetting}
      />
    ));
  }, [sheet, appearance, setAppearance, motionSetting, setMotionSetting]);

  const serverSheet = useCallback(() => {
    sheet.open('Where your data lives.', () => <ServerSheet />);
  }, [sheet]);

  const designSheet = useCallback(() => {
    sheet.open('Which design?', () => <DesignSheet />);
  }, [sheet]);

  return (
    <Screen contextKey="me" onRefresh={refresh} refreshing={refreshing}>
      <TopBar label="Me · Your space" />
      <View style={[s.avatar, { backgroundColor: c.panel, borderColor: c.line }]}>
        <Animated.Text style={[s.avatarLetter, { color: c.accent }]}>J</Animated.Text>
      </View>
      <Title>A little more{'\n'}<Em>like you.</Em></Title>
      <Body style={{ marginTop: 12 }}>Your preferences, memories, and connections.</Body>

      <Section title="What Habits knows" />
      <GoalRow
        first
        icon="chevron-forward"
        title="Food & cooking"
        subtitle={food ? `Budget ${'$'}${food.budget_per_cycle} a cycle · ordering ${food.ordering_enabled ? 'on' : 'off'}` : 'Preferences and budget'}
        onPress={() => navigation.navigate('Food')}
      />
      <GoalRow
        icon="chevron-forward"
        title="Training"
        subtitle="Golf performance · September 2026 → spring 2027"
        onPress={() => navigation.navigate('Train')}
      />
      <GoalRow
        icon="chevron-forward"
        title="Calendar"
        subtitle={feeds.length ? `${feeds.length} feed${feeds.length === 1 ? '' : 's'} connected` : 'Not connected'}
        onPress={() => sheet.open('Room for real life.', () => (
          <View>
            {feeds.length ? feeds.map(f => (
              <DetailRow
                key={f.id}
                label={f.label}
                sub={f.last_synced_at ? `synced ${f.last_synced_at.slice(0, 10)}` : 'never synced'}
                value={`${f.events} events · ${f.travel_spans} travel`}
              />
            )) : <Body>No calendar connected yet.</Body>}
            <Small style={{ marginTop: 14 }}>Travel from your calendar re-plans training and skips meal days.</Small>
          </View>
        ))}
      />
      <GoalRow
        icon="chevron-forward"
        title="Deep work"
        subtitle={stats ? `${stats.hours.all_time.toFixed(0)} lifetime hours across ${stats.pillar_breakdown.length} pillars` : '—'}
        onPress={() => navigation.navigate('NorthStar')}
      />
      <GoalRow icon="chevron-forward" title="Appearance" subtitle={APPEARANCE_LABEL[appearance]} onPress={appearanceSheet} />
      <GoalRow icon="chevron-forward" title="Design" subtitle="Liquid, or the previous frontend" onPress={designSheet} />
      <GoalRow
        icon="chevron-forward"
        title="Server"
        subtitle={
          server === 'stale'
            ? `${API_URL.replace(/^https?:\/\//, '')} · out of date, repoint this`
            : server === 'unreachable'
              ? `${API_URL.replace(/^https?:\/\//, '')} · not responding`
              : API_URL.replace(/^https?:\/\//, '')
        }
        onPress={serverSheet}
      />
      {server === 'stale' ? (
        <Notice icon="warning-outline">
          This server answers, but it does not have Training, Food or the coach. It is an older
          deployment. Open Server above and point the app at your Mac.
        </Notice>
      ) : null}

      <Notice icon="laptop-outline">
        Runs on your own Mac over Tailscale. Build {Constants.expoConfig?.version ?? '—'}
        {Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ''}.
      </Notice>
    </Screen>
  );
}

function AppearanceSheet({ appearance, setAppearance, motion, setMotion }: {
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  motion: MotionSetting;
  setMotion: (m: MotionSetting) => void;
}) {
  return (
    <View>
      <Body>The same Habits, in a different light.</Body>
      <Options
        values={['auto', 'pearl', 'ink'] as Appearance[]}
        selected={appearance}
        onSelect={setAppearance}
        labels={v => (v === 'auto' ? 'Device' : v === 'pearl' ? 'Pearl' : 'Ink')}
      />
      <Small>Motion</Small>
      <Options
        values={['fluid', 'quiet'] as MotionSetting[]}
        selected={motion}
        onSelect={setMotion}
        labels={v => (v === 'fluid' ? 'Fluid' : 'Quiet')}
      />
      <Small>
        Quiet removes spatial animation and the aurora’s drift while keeping every state change
        immediate. Reduce Motion does the same automatically.
      </Small>
    </View>
  );
}

function DesignSheet() {
  const sheet = useSheet();
  const toast = useToast();
  const [version, setVersion] = useState<DesignVersion>('liquid');
  useEffect(() => { getDesignVersion().then(setVersion); }, []);

  const choose = async (v: DesignVersion) => {
    setVersion(v);
    await setDesignVersion(v);
    feel.light();
    if (v === 'classic') {
      Alert.alert(
        'Previous design',
        'Close and reopen Habits to go back. The liquid design stays available here.',
      );
    } else {
      toast.show('Liquid design selected.');
    }
  };

  return (
    <View>
      <Body>
        Liquid is the current design. The previous frontend is kept whole, so switching back is a
        toggle rather than a rebuild.
      </Body>
      <Options
        values={['liquid', 'classic'] as DesignVersion[]}
        selected={version}
        onSelect={choose}
        labels={v => (v === 'liquid' ? 'Liquid' : 'Previous')}
      />
      <Small>The change takes effect the next time the app starts.</Small>
      <Button full kind="quiet" label="Close" onPress={sheet.close} />
    </View>
  );
}

function ServerSheet() {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadServerSettings().then(sv => { setUrl(sv.serverUrl); setKey(sv.apiKey); }); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const normalized = normalizeServerUrl(url);
      const health = await checkHealth({ serverUrl: normalized, apiKey: key.trim() });
      if (!health.ok) { toast.show(`Could not reach it: ${health.error ?? 'no response'}`); return; }
      const saved = await saveServerSettings({ serverUrl: normalized, apiKey: key.trim() });
      setRuntimeServer(saved.serverUrl, saved.apiKey);
      feel.success();
      sheet.close();
      toast.show('Connected.');
    } catch (err: any) {
      toast.show(String(err?.message ?? err));
    } finally { setBusy(false); }
  };

  return (
    <View>
      <Body>The backend runs on your Mac over Tailscale. Change this only if the address or key changes.</Body>
      <Small style={{ marginTop: 16 }}>Address</Small>
      <TextInput
        style={[s.input, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://…"
        placeholderTextColor={c.muted}
      />
      <Small>API key</Small>
      <TextInput
        style={[s.input, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Paste the key"
        placeholderTextColor={c.muted}
      />
      <Button full label={busy ? 'Checking…' : 'Test and save'} disabled={busy} onPress={save} />
    </View>
  );
}

const s = StyleSheet.create({
  avatar: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 19,
  },
  avatarLetter: { fontFamily: fonts.serif, fontSize: 36, marginTop: -4 },
  input: {
    borderWidth: 1, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.regular, fontSize: 16, marginTop: 6, marginBottom: 14, minHeight: 48,
  },
});
