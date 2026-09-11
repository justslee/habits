/**
 * Which frontend the app runs: the liquid design, or the previous one.
 *
 * The switch is stored on the device, so rolling back is a toggle in Me → Appearance rather
 * than a rebuild. `liquid` is the default; `classic` renders the previous screens untouched.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type DesignVersion = 'liquid' | 'classic';

const KEY = 'habits.designVersion';
export const DEFAULT_VERSION: DesignVersion = 'liquid';

export async function getDesignVersion(): Promise<DesignVersion> {
  try {
    const v = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(KEY)
      : await SecureStore.getItemAsync(KEY);
    return v === 'classic' || v === 'liquid' ? v : DEFAULT_VERSION;
  } catch {
    return DEFAULT_VERSION;
  }
}

export async function setDesignVersion(v: DesignVersion): Promise<void> {
  try {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(KEY, v); return; }
    await SecureStore.setItemAsync(KEY, v);
  } catch { /* the toggle simply does not persist */ }
}
