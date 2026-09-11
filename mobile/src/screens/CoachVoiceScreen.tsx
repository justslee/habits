/**
 * CoachVoiceScreen — talk to the coach live. OpenAI Realtime over WebRTC: the Mac mints a
 * short-lived client secret with today's program as context; audio goes straight between
 * the device and OpenAI. Works on iOS (react-native-webrtc) and in the browser.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { adjustTraining, getCoachContext, getRealtimeSession } from '../api/client';
import { haptic } from '../utils/haptics';
import ScreenBackground from '../components/ScreenBackground';
import { rtc } from '../lib/rtc';

type Line = { who: 'you' | 'coach' | 'app'; text: string };
type State = 'idle' | 'connecting' | 'live' | 'error';

export default function CoachVoiceScreen() {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [contextPreview, setContextPreview] = useState<string>('');
  const pc = useRef<any>(null);
  const stream = useRef<any>(null);
  const dc = useRef<any>(null);
  const partial = useRef<string>('');

  useEffect(() => { getCoachContext().then(c => setContextPreview(c.context.split('\n').slice(1, 4).join('\n'))).catch(() => {}); }, []);
  useEffect(() => () => { stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (who: Line['who'], text: string) => setLines(prev => [...prev.slice(-30), { who, text }]);

  const stop = useCallback(() => {
    try { dc.current?.close?.(); } catch {}
    try { pc.current?.close?.(); } catch {}
    try { stream.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    dc.current = null; pc.current = null; stream.current = null;
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    haptic.medium();
    setError(null);
    setState('connecting');
    try {
      const { RTCPeerConnection, mediaDevices, registerGlobals } = rtc();
      if (!RTCPeerConnection || !mediaDevices) throw new Error('WebRTC is not available on this build');
      registerGlobals?.();
      const session = await getRealtimeSession();
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.current = peer;
      const mic = await mediaDevices.getUserMedia({ audio: true, video: false });
      stream.current = mic;
      mic.getTracks().forEach((t: any) => peer.addTrack(t, mic));
      peer.ontrack = (ev: any) => {
        if (Platform.OS === 'web') {
          const el = document.createElement('audio');
          el.autoplay = true; (el as any).srcObject = ev.streams[0]; document.body.appendChild(el);
        }
        // on iOS react-native-webrtc routes remote audio to the speaker automatically
      };
      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;
      channel.onmessage = (m: any) => {
        try {
          const ev = JSON.parse(m.data);
          if (ev.type === 'response.output_audio_transcript.delta' || ev.type === 'response.audio_transcript.delta') {
            partial.current += ev.delta || '';
          } else if (ev.type === 'response.output_audio_transcript.done' || ev.type === 'response.audio_transcript.done') {
            if (partial.current.trim()) push('coach', partial.current.trim());
            partial.current = '';
          } else if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) {
            push('you', ev.transcript);
          } else if (ev.type === 'response.function_call_arguments.done' && ev.name === 'adjust_training') {
            // the coach decided to change a day: apply it on the Mac, hand the result back, let the coach confirm out loud
            (async () => {
              let output: string;
              try {
                const args = JSON.parse(ev.arguments || '{}');
                const r = await adjustTraining(args);
                output = JSON.stringify({ ok: true, changes: r.changes, note: r.note });
                push('app', `Week re-planned: ${r.changes.join(' · ')}`);
              } catch (err: any) {
                output = JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 200) });
                push('app', `Could not apply that change: ${String(err?.message || err).slice(0, 120)}`);
              }
              channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output } }));
              channel.send(JSON.stringify({ type: 'response.create' }));
            })();
          } else if (ev.type === 'error') {
            setError(ev.error?.message || 'realtime error');
          }
        } catch {}
      };
      channel.onopen = () => {
        channel.send(JSON.stringify({ type: 'session.update', session: { audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' } } } } }));
        setState('live');
        haptic.success();
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const resp = await fetch(session.calls_url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.client_secret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      const answer = await resp.text();
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
    } catch (err: any) {
      setError(String(err?.message || err));
      setState('error');
      stop();
    }
  }, [stop]);

  const live = state === 'live';
  return (
    <ScreenBackground>
      <View style={s.container}>
        <Text style={typography.eyebrow}>LIVE COACH · OPENAI REALTIME · {Platform.OS === 'web' ? 'BROWSER' : 'PHONE'}</Text>
        <Text style={s.title}>Talk it through</Text>
        <Text style={s.help}>The coach hears you and answers out loud, with today's session, the week, and your last sets already in front of it. Audio goes straight to OpenAI; the Mac only issues the one-minute pass.</Text>
        {contextPreview ? <View style={s.ctx}><Text style={s.ctxText}>{contextPreview}</Text></View> : null}

        <View style={[s.orb, live && s.orbLive, state === 'connecting' && s.orbConnecting]}>
          <Text style={s.orbText}>{state === 'live' ? 'Listening' : state === 'connecting' ? 'Connecting…' : state === 'error' ? 'Stopped' : 'Off'}</Text>
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={[s.btn, live && { backgroundColor: colors.error }]} onPress={live ? stop : start} disabled={state === 'connecting'} activeOpacity={0.9}>
          <Text style={s.btnText}>{live ? 'End' : state === 'connecting' ? 'Connecting…' : 'Start talking'}</Text>
        </TouchableOpacity>

        <ScrollView style={s.transcript} contentContainerStyle={{ paddingBottom: 140 }}>
          {lines.map((l, i) => (
            <View key={i} style={[s.line, l.who === 'you' && s.lineYou, l.who === 'app' && s.lineApp]}>
              <Text style={s.who}>{l.who === 'you' ? 'YOU' : l.who === 'app' ? 'PLAN' : 'COACH'}</Text>
              <Text style={s.lineText}>{l.text}</Text>
            </View>
          ))}
          {!lines.length && live && <Text style={s.help}>Say "what's my trap-bar load today?", "I only have 50 minutes", or "I'm running 6 miles outside instead of the gym" — the coach re-plans the week for you.</Text>}
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 6 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginBottom: 10 },
  ctx: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 10, marginBottom: 12 },
  ctxText: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textTertiary, lineHeight: 15 },
  orb: { alignSelf: 'center', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginVertical: 14, backgroundColor: colors.card },
  orbLive: { borderColor: colors.success, backgroundColor: 'rgba(118,201,156,0.12)' },
  orbConnecting: { borderColor: colors.accent },
  orbText: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1, color: colors.text },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.error, textAlign: 'center', marginBottom: 8 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  transcript: { flex: 1, marginTop: 14 },
  line: { backgroundColor: colors.card, borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.line },
  lineYou: { backgroundColor: colors.input },
  lineApp: { borderColor: colors.accent },
  who: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2, color: colors.textTertiary, marginBottom: 3 },
  lineText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text, lineHeight: 19 },
});
