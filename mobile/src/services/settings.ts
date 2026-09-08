/**
 * Runtime server settings — lets the phone point at a different backend without a
 * rebuild. Stored in the iOS keychain via expo-secure-store (localStorage on web).
 *
 * Resolution order: saved override → build-time EXPO_PUBLIC_* → localhost.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY_URL = 'habits.serverUrl';
const KEY_API = 'habits.apiKey';

export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
export const DEFAULT_API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

export interface ServerSettings {
  serverUrl: string;
  apiKey: string;
  /** True when at least one value differs from the build-time default. */
  isCustom: boolean;
}

async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch (err) {
    console.warn('settings: could not persist', key, err);
  }
}

/** Trim, add https:// when no scheme was typed, drop trailing slashes. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

export async function loadServerSettings(): Promise<ServerSettings> {
  const [savedUrl, savedKey] = await Promise.all([getItem(KEY_URL), getItem(KEY_API)]);
  const serverUrl = savedUrl ? normalizeServerUrl(savedUrl) : DEFAULT_SERVER_URL;
  const apiKey = savedKey ?? DEFAULT_API_KEY;
  return { serverUrl, apiKey, isCustom: serverUrl !== DEFAULT_SERVER_URL || apiKey !== DEFAULT_API_KEY };
}

export async function saveServerSettings(next: { serverUrl: string; apiKey: string }): Promise<ServerSettings> {
  const serverUrl = normalizeServerUrl(next.serverUrl) || DEFAULT_SERVER_URL;
  const apiKey = next.apiKey.trim();
  await Promise.all([
    setItem(KEY_URL, serverUrl === DEFAULT_SERVER_URL ? null : serverUrl),
    setItem(KEY_API, apiKey === DEFAULT_API_KEY ? null : apiKey),
  ]);
  return { serverUrl, apiKey, isCustom: serverUrl !== DEFAULT_SERVER_URL || apiKey !== DEFAULT_API_KEY };
}

export async function resetServerSettings(): Promise<ServerSettings> {
  await Promise.all([setItem(KEY_URL, null), setItem(KEY_API, null)]);
  return { serverUrl: DEFAULT_SERVER_URL, apiKey: DEFAULT_API_KEY, isCustom: false };
}

/** Hostname only, for display ("justins-macbook-pro-2.tail2c4851.ts.net"). */
export function serverHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
