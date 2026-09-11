/**
 * Talking to the coach out loud, on OpenAI's GPT-Live.
 *
 * GPT-Live is full duplex: it can listen while it speaks, so it takes an interruption without
 * having to be stopped first. It holds the conversation and hands the thinking and the tools to
 * a backend model, which is where `adjust_training` runs — against the same endpoint the typed
 * chat uses, so changing a day out loud changes it everywhere.
 *
 * Unlike the Realtime API it mints no ephemeral secret: the WebRTC offer is part of creating the
 * session and must carry the project key. So the phone sends its offer to the Mac, the Mac
 * creates the session and returns only the answer. The key never reaches the device, and the
 * audio path is still negotiated straight to OpenAI — only the handshake goes through us.
 *
 * Transcripts arrive as fragments with no turn-completed event, so turns are grouped here: a
 * speaker's fragments are joined until they fall quiet or the other speaker starts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { adjustTraining, createLiveSession } from '../api/client';
import { rtc } from '../lib/rtc';

export type VoiceState = 'idle' | 'connecting' | 'live' | 'error';

/** How long a speaker may pause before their fragments are treated as a finished turn. */
const TURN_GAP_MS = 1100;

export interface VoiceHandlers {
  /** A finished run of speech from you. */
  onYou: (text: string) => void;
  /** A finished run of speech from the coach. */
  onCoach: (text: string) => void;
  /** The coach changed the plan. The strings are what moved. */
  onChanged?: (changes: string[]) => void;
  /** Something went wrong, in words worth showing. */
  onError?: (message: string) => void;
}

type Who = 'you' | 'coach';

export function useVoiceCoach(handlers: VoiceHandlers) {
  const [state, setState] = useState<VoiceState>('idle');
  const [speaking, setSpeaking] = useState(false);
  const pc = useRef<any>(null);
  const mic = useRef<any>(null);
  const dc = useRef<any>(null);
  const h = useRef(handlers);
  h.current = handlers;

  // Fragments waiting to become a turn, and the timer that closes them.
  const buffer = useRef<{ who: Who; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Function calls seen on this response, so a result is submitted exactly once.
  const calls = useRef(new Map<string, { name: string; args: string }>());

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const held = buffer.current;
    buffer.current = null;
    if (!held?.text.trim()) return;
    if (held.who === 'you') h.current.onYou(held.text.trim());
    else h.current.onCoach(held.text.trim());
  }, []);

  /** Add a fragment, closing the previous speaker's turn if the floor changed. */
  const fragment = useCallback((who: Who, text: string) => {
    if (!text) return;
    if (buffer.current && buffer.current.who !== who) flush();
    buffer.current = { who, text: (buffer.current?.text ?? '') + text };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, TURN_GAP_MS);
  }, [flush]);

  const stop = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    flush();
    try { dc.current?.close?.(); } catch {}
    try { pc.current?.close?.(); } catch {}
    try { mic.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    dc.current = null;
    pc.current = null;
    mic.current = null;
    calls.current.clear();
    setSpeaking(false);
    setState('idle');
  }, [flush]);

  // Hanging up when the sheet closes matters: the microphone stays open otherwise.
  useEffect(() => () => { stop(); }, [stop]);

  /** Run a tool the backend asked for, hand the result back, and let the coach continue. */
  const runCall = useCallback(async (channel: any, callId: string, name: string, args: string) => {
    if (name !== 'adjust_training') return;
    let output: string;
    try {
      const r = await adjustTraining(JSON.parse(args || '{}'));
      output = JSON.stringify({ ok: true, changes: r.changes, note: r.note });
      h.current.onChanged?.(r.changes);
    } catch (err: any) {
      const why = String(err?.message ?? err).slice(0, 200);
      output = JSON.stringify({ ok: false, error: why });
      h.current.onError?.(`That change did not save. ${why}`);
    }
    try {
      channel.send(JSON.stringify({
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: callId, output },
      }));
      channel.send(JSON.stringify({ type: 'response.create' }));
    } catch {}
  }, []);

  const start = useCallback(async () => {
    setState('connecting');
    try {
      const { RTCPeerConnection, mediaDevices, registerGlobals } = rtc();
      if (!RTCPeerConnection || !mediaDevices) throw new Error('Voice needs a build with WebRTC in it.');
      registerGlobals?.();

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

      // The channel and its listeners must exist before the offer is made.
      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;

      channel.onmessage = (m: any) => {
        let ev: any;
        try { ev = JSON.parse(m.data); } catch { return; }

        // Backend work arrives wrapped; the Responses event is nested under `event`.
        const inner = ev?.event;
        if (inner?.type === 'response.output_item.done' && inner.item?.type === 'function_call') {
          const { call_id: id, name, arguments: args } = inner.item;
          if (id && !calls.current.has(id)) {
            calls.current.set(id, { name, args });
            runCall(channel, id, name, args);
          }
          return;
        }

        switch (ev.type) {
          case 'session.started':
            setState('live');
            // GPT-Live waits to be spoken to. Ask it to open, so pressing the microphone is
            // answered by a voice rather than by silence.
            try {
              channel.send(JSON.stringify({
                type: 'session.instructions.append',
                delegation_id: null,
                content:
                  'Greet the athlete immediately in English, without waiting for them to speak. ' +
                  'One short sentence naming what today holds, then stop and listen.',
              }));
            } catch {}
            break;

          case 'session.input_transcript.delta':
            fragment('you', ev.delta ?? '');
            break;

          case 'session.output_transcript.delta':
            fragment('coach', ev.delta ?? '');
            setSpeaking(true);
            break;

          case 'session.output_audio.done':
          case 'response.completed':
            setSpeaking(false);
            break;

          case 'session.closed':
            flush();
            setState('idle');
            break;

          case 'error':
            h.current.onError?.(ev.error?.message || 'The connection had a problem.');
            break;
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      // The Mac creates the session with our key and hands back only the answer.
      const session = await createLiveSession(offer.sdp);
      await peer.setRemoteDescription({ type: 'answer', sdp: session.sdp });
      // The HTTP request started the session; never send session.start on the channel.
    } catch (err: any) {
      h.current.onError?.(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 160));
      setState('error');
      stop();
    }
  }, [stop, fragment, flush, runCall]);

  return { state, speaking, start, stop };
}
