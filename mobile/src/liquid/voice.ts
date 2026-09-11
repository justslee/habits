/**
 * Talking to the coach out loud, over OpenAI's Realtime API.
 *
 * The Mac mints a short-lived client secret with today's programme already in it, then audio
 * goes straight between the phone and OpenAI over WebRTC. Nothing spoken passes through our
 * server, and the secret is single-use and lives about a minute.
 *
 * Both halves are transcribed so the conversation reads the same whether it was typed or
 * spoken, and the coach's `adjust_training` tool runs against the same endpoint the text chat
 * uses, so changing a day by voice changes it everywhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { adjustTraining, getRealtimeSession } from '../api/client';
import { rtc } from '../lib/rtc';

export type VoiceState = 'idle' | 'connecting' | 'live' | 'error';

export interface VoiceHandlers {
  /** A finished sentence from you. */
  onYou: (text: string) => void;
  /** A finished sentence from the coach. */
  onCoach: (text: string) => void;
  /** The coach changed the plan. The strings are what moved. */
  onChanged?: (changes: string[]) => void;
  /** Something went wrong, in words worth showing. */
  onError?: (message: string) => void;
}

export function useVoiceCoach(handlers: VoiceHandlers) {
  const [state, setState] = useState<VoiceState>('idle');
  const [speaking, setSpeaking] = useState(false);
  const pc = useRef<any>(null);
  const mic = useRef<any>(null);
  const dc = useRef<any>(null);
  const partial = useRef('');
  // Handlers change identity every render; the data channel closure must not go stale.
  const h = useRef(handlers);
  h.current = handlers;

  const stop = useCallback(() => {
    try { dc.current?.close?.(); } catch {}
    try { pc.current?.close?.(); } catch {}
    try { mic.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    dc.current = null;
    pc.current = null;
    mic.current = null;
    partial.current = '';
    setSpeaking(false);
    setState('idle');
  }, []);

  // Hanging up when the sheet closes matters: the microphone stays open otherwise.
  useEffect(() => () => { stop(); }, [stop]);

  const start = useCallback(async () => {
    setState('connecting');
    try {
      const { RTCPeerConnection, mediaDevices, registerGlobals } = rtc();
      if (!RTCPeerConnection || !mediaDevices) throw new Error('Voice needs a build with WebRTC in it.');
      registerGlobals?.();

      const session = await getRealtimeSession();
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.current = peer;

      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      mic.current = stream;
      stream.getTracks().forEach((t: any) => peer.addTrack(t, stream));

      peer.ontrack = (ev: any) => {
        // iOS routes the remote track to the speaker itself; the browser needs an element.
        if (Platform.OS === 'web') {
          const el = document.createElement('audio');
          el.autoplay = true;
          (el as any).srcObject = ev.streams[0];
          document.body.appendChild(el);
        }
      };

      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;

      channel.onmessage = (m: any) => {
        let ev: any;
        try { ev = JSON.parse(m.data); } catch { return; }

        switch (ev.type) {
          case 'response.output_audio_transcript.delta':
          case 'response.audio_transcript.delta':
            partial.current += ev.delta || '';
            setSpeaking(true);
            break;

          case 'response.output_audio_transcript.done':
          case 'response.audio_transcript.done':
            if (partial.current.trim()) h.current.onCoach(partial.current.trim());
            partial.current = '';
            setSpeaking(false);
            break;

          case 'conversation.item.input_audio_transcription.completed':
            if (ev.transcript?.trim()) h.current.onYou(ev.transcript.trim());
            break;

          case 'response.function_call_arguments.done':
            if (ev.name !== 'adjust_training') break;
            // The coach decided to move something. Apply it here, hand the result back, and
            // let the coach say out loud what happened.
            (async () => {
              let output: string;
              try {
                const r = await adjustTraining(JSON.parse(ev.arguments || '{}'));
                output = JSON.stringify({ ok: true, changes: r.changes, note: r.note });
                h.current.onChanged?.(r.changes);
              } catch (err: any) {
                const why = String(err?.message ?? err).slice(0, 200);
                output = JSON.stringify({ ok: false, error: why });
                h.current.onError?.(`That change did not save. ${why}`);
              }
              try {
                channel.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: { type: 'function_call_output', call_id: ev.call_id, output },
                }));
                channel.send(JSON.stringify({ type: 'response.create' }));
              } catch {}
            })();
            break;

          case 'error':
            h.current.onError?.(ev.error?.message || 'The connection had a problem.');
            break;
        }
      };

      channel.onopen = () => {
        // The server chooses the transcription model, so moving to the next one needs no build.
        // An older server does not name one; fall back rather than send an undefined model.
        const transcribe = session.transcribe_model || 'gpt-live-transcribe';
        channel.send(JSON.stringify({
          type: 'session.update',
          session: { audio: { input: { transcription: { model: transcribe } } } },
        }));
        setState('live');
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const resp = await fetch(session.calls_url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.client_secret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
      await peer.setRemoteDescription({ type: 'answer', sdp: await resp.text() });
    } catch (err: any) {
      h.current.onError?.(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 160));
      setState('error');
      stop();
    }
  }, [stop]);

  return { state, speaking, start, stop };
}
