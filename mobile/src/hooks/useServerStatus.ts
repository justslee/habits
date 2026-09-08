/**
 * useServerStatus — is the backend reachable right now?
 *
 * Checks /health on mount, whenever the app returns to the foreground, and every
 * 20 s while offline so the banner clears itself once Tailscale comes up.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { checkHealth, subscribeServerChange } from '../api/client';

export type ServerStatus = 'checking' | 'online' | 'offline';

const RETRY_MS = 20_000;

export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [lastError, setLastError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    const result = await checkHealth();
    setStatus(result.ok ? 'online' : 'offline');
    setLastError(result.ok ? null : result.error);
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    const unsubscribe = subscribeServerChange(() => {
      setStatus('checking');
      check();
    });
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [check]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (status === 'offline') timer.current = setTimeout(check, RETRY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, check]);

  return { status, lastError, retry: check };
}
