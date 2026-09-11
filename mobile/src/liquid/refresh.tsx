/**
 * A signal that says "the server changed underneath you, load again".
 *
 * Screens reload when they take focus, which covers navigation but not sheets: a sheet is a
 * modal over the screen, so the screen never loses focus and never refetches. The coach changes
 * training from inside a sheet, so without this the plan changes on the server and the screen
 * keeps showing the old one.
 *
 * Anything that changes server state from a sheet calls `bump()`. Screens pass their loader to
 * `useRefreshOn` and are brought up to date wherever they are.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface Refresh {
  /** Increments every time something changed the server's mind. */
  signal: number;
  bump: () => void;
}

const Ctx = createContext<Refresh>({ signal: 0, bump: () => {} });

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [signal, setSignal] = useState(0);
  const bump = useCallback(() => setSignal(n => n + 1), []);
  const value = useMemo(() => ({ signal, bump }), [signal, bump]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRefresh(): Refresh {
  return useContext(Ctx);
}

/**
 * Run `load` whenever something else changes server state. The first render is not a change, and
 * a new `load` identity on its own is not one either, so this fires only on a real bump.
 */
export function useRefreshOn(load: () => void | Promise<void>) {
  const { signal } = useContext(Ctx);
  const seen = useRef(signal);
  const latest = useRef(load);
  latest.current = load;

  useEffect(() => {
    if (seen.current === signal) return;
    seen.current = signal;
    latest.current();
  }, [signal]);
}
