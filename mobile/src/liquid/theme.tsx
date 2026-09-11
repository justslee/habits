/**
 * Liquid theme — appearance (auto / Pearl / Ink), motion (fluid / quiet), and the resolved
 * palette. Appearance defaults to the device; the choice is stored so it survives a restart.
 *
 * `useTheme()` gives every screen its palette; `useMotion()` reports whether spatial animation
 * should run at all (quiet mode and the system Reduce Motion switch both turn it off).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Appearance, Look, MotionSetting, Palette, palettes } from './tokens';

const KEY_APPEARANCE = 'habits.appearance';
const KEY_MOTION = 'habits.motion';

async function read(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  } catch { /* a failed write only costs the preference next launch */ }
}

interface ThemeValue {
  look: Look;
  c: Palette;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  motionSetting: MotionSetting;
  setMotionSetting: (m: MotionSetting) => void;
  /** False when Reduce Motion is on or the owner chose Quiet. Spatial animation must not run. */
  moves: boolean;
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function LiquidThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('auto');
  const [motionSetting, setMotionState] = useState<MotionSetting>('fluid');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    read(KEY_APPEARANCE).then(v => { if (v === 'auto' || v === 'ink' || v === 'pearl') setAppearanceState(v); });
    read(KEY_MOTION).then(v => { if (v === 'fluid' || v === 'quiet') setMotionState(v); });
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const setAppearance = useCallback((a: Appearance) => { setAppearanceState(a); write(KEY_APPEARANCE, a); }, []);
  const setMotionSetting = useCallback((m: MotionSetting) => { setMotionState(m); write(KEY_MOTION, m); }, []);

  const value = useMemo<ThemeValue>(() => {
    const look: Look = appearance === 'auto' ? (scheme === 'light' ? 'pearl' : 'ink') : appearance;
    return {
      look,
      c: palettes[look],
      appearance,
      setAppearance,
      motionSetting,
      setMotionSetting,
      moves: motionSetting === 'fluid' && !reduceMotion,
      reduceMotion,
    };
  }, [appearance, scheme, motionSetting, reduceMotion, setAppearance, setMotionSetting]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside LiquidThemeProvider');
  return v;
}

/** Just the palette, for the common case. */
export function useColors(): Palette {
  return useTheme().c;
}

/** True when spatial animation is allowed. */
export function useMoves(): boolean {
  return useTheme().moves;
}
