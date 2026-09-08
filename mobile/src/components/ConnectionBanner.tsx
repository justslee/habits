/**
 * ConnectionBanner — floating pill shown when the backend is unreachable.
 * The server lives on a Mac behind Tailscale, so the usual fix is turning the VPN on.
 * Overlays the status-bar area so screens keep their own layout.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme';
import { getApiUrl } from '../api/client';
import { serverHost } from '../services/settings';
import type { ServerStatus } from '../hooks/useServerStatus';

interface Props {
  status: ServerStatus;
  lastError?: string | null;
  onRetry: () => void;
}

export default function ConnectionBanner({ status, lastError, onRetry }: Props) {
  const insets = useSafeAreaInsets();
  if (status !== 'offline') return null;

  const hint = lastError === 'API key rejected'
    ? 'Check the API key in Me → Server'
    : `Turn on Tailscale, then retry · ${serverHost(getApiUrl())}`;

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 6 }]}>
      <View style={styles.pill} accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
        <View style={styles.textCol}>
          <Text style={styles.title}>Can't reach the server</Text>
          <Text style={styles.sub} numberOfLines={1}>{hint}</Text>
        </View>
        <TouchableOpacity onPress={onRetry} style={styles.btn} accessibilityLabel="Retry connection">
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 100,
    elevation: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  textCol: { flex: 1 },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  sub: { color: colors.textTertiary, fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentMuted,
  },
  btnText: { color: colors.accentLight, fontFamily: fonts.semibold, fontSize: 12 },
});
