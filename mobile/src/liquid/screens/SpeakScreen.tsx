/**
 * Speak — space to think out loud.
 *
 * The orb is the whole interface: start talking and the live coach listens and answers, with
 * today's programme already in front of it. Past reflections are real speaking sessions, and
 * when there are none the screen says so rather than inventing a history.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { SpeakingSessionData, SpeakingStatsData, getSpeakingSessions, getSpeakingStats } from '../../api/client';
import { useTheme } from '../theme';
import { fonts } from '../tokens';
import { Screen } from '../ui/Screen';
import { Body, Em, Small, Subtitle, Title } from '../ui/Text';
import { Button } from '../ui/Button';
import { GoalRow, Section, TopBar } from '../ui/Surfaces';
import { VoiceOrb } from '../ui/Sculpture';
import { useSheet } from '../ui/Sheet';
import { prettyDate } from '../ui/Chart';

const BARS = [9, 18, 12, 27, 33, 19, 26, 13, 23, 31, 17, 10];

export default function SpeakScreen({ navigation }: any) {
  const { c, moves } = useTheme();
  const sheet = useSheet();
  const [sessions, setSessions] = useState<SpeakingSessionData[]>([]);
  const [stats, setStats] = useState<SpeakingStatsData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const breathe = useSharedValue(0);

  const load = useCallback(async () => {
    const [s, st] = await Promise.allSettled([getSpeakingSessions(8), getSpeakingStats()]);
    if (s.status === 'fulfilled') setSessions(s.value);
    if (st.status === 'fulfilled') setStats(st.value);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!moves) { cancelAnimation(breathe); return; }
    breathe.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [moves, breathe]);

  const orb = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-20 + breathe.value * 44}deg` }, { scale: 1 + breathe.value * 0.06 }],
  }));

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  return (
    <Screen contextKey="speak" onRefresh={refresh} refreshing={refreshing}>
      <TopBar label="Speak · Space to think" onProfile={() => navigation.navigate('Me')} />
      <Title>A thought,{'\n'}<Em>out loud.</Em></Title>
      <Body style={{ marginTop: 12 }}>
        Practise a story. Untangle an idea.{'\n'}Or simply get it off your mind.
      </Body>

      <View style={s.stage}>
        <Animated.View style={orb}><VoiceOrb /></Animated.View>
        <View style={s.wave}>
          {BARS.map((h, i) => (
            <View key={i} style={{ width: 3, height: 4 + (i % 3) * 3, borderRadius: 4, backgroundColor: c.accent }} />
          ))}
        </View>
      </View>

      <Subtitle style={{ textAlign: 'center' }}>What’s on your mind?</Subtitle>
      <Small style={{ textAlign: 'center', marginTop: 11, marginBottom: 22 }}>
        The coach hears you and answers out loud.
      </Small>
      <Button
        full
        label="Start talking"
        icon="mic"
        haptic="soft"
        onPress={() => navigation.navigate('Train', { screen: 'CoachVoice' })}
      />

      {stats?.total_sessions ? (
        <>
          <Section title="Your practice" trailing={<Small>{stats.total_sessions} sessions</Small>} />
          <Body>
            {Math.round(stats.total_minutes)} minutes recorded
            {stats.recent_trend ? ` · ${stats.recent_trend.improving ? 'improving' : 'holding'}` : ''}
          </Body>
        </>
      ) : null}

      <Section title="Pick up a thread" />
      {sessions.length ? sessions.map((sess, i) => (
        <GoalRow
          key={sess.id}
          first={i === 0}
          title={sess.topic ?? 'A reflection'}
          subtitle={`${prettyDate(sess.created_at.slice(0, 10))}${sess.duration_seconds ? ` · ${Math.round(sess.duration_seconds / 60)} min` : ''}`}
          onPress={() => sheet.open(sess.topic ?? 'A reflection', () => (
            <View>
              <Small>{prettyDate(sess.created_at.slice(0, 10))}{sess.audience ? ` · ${sess.audience}` : ''}</Small>
              <Body style={{ marginTop: 12 }}>{sess.transcript ?? 'No transcript saved for this session.'}</Body>
            </View>
          ))}
        />
      )) : (
        <Body>No recorded sessions yet. Nothing here is invented.</Body>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  stage: { alignItems: 'center', paddingTop: 20, paddingBottom: 30 },
  wave: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 34, marginTop: 25 },
});
