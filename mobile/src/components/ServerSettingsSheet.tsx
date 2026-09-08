/**
 * ServerSettingsSheet — point the app at a different backend without a rebuild.
 * Opened from Me → Server. Values persist in the keychain (see services/settings).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { checkHealth, setRuntimeServer } from '../api/client';
import {
  DEFAULT_SERVER_URL, loadServerSettings, normalizeServerUrl, resetServerSettings, saveServerSettings,
} from '../services/settings';
import { haptic } from '../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after settings are saved or reset. */
  onChanged?: () => void;
}

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'fail'; error: string };

export default function ServerSettingsSheet({ visible, onClose, onChanged }: Props) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTest({ kind: 'idle' });
    loadServerSettings().then((s) => {
      setUrl(s.serverUrl);
      setKey(s.apiKey);
      setIsCustom(s.isCustom);
    });
  }, [visible]);

  const runTest = useCallback(async () => {
    haptic.light();
    setTest({ kind: 'testing' });
    const result = await checkHealth({ serverUrl: normalizeServerUrl(url), apiKey: key.trim() });
    setTest(result.ok ? { kind: 'ok' } : { kind: 'fail', error: result.error ?? 'Unreachable' });
  }, [url, key]);

  const save = useCallback(async () => {
    haptic.medium();
    setSaving(true);
    try {
      const s = await saveServerSettings({ serverUrl: url, apiKey: key });
      setRuntimeServer(s.serverUrl, s.apiKey);
      onChanged?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [url, key, onChanged, onClose]);

  const reset = useCallback(async () => {
    haptic.medium();
    const s = await resetServerSettings();
    setUrl(s.serverUrl);
    setKey(s.apiKey);
    setIsCustom(false);
    setRuntimeServer(s.serverUrl, s.apiKey);
    setTest({ kind: 'idle' });
    onChanged?.();
  }, [onChanged]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightPct={0.8}>
      <View style={styles.wrap}>
        <Text style={typography.eyebrow}>Server</Text>
        <Text style={styles.title}>Where this app talks to</Text>
        <Text style={styles.help}>
          The backend runs on your Mac over Tailscale. Change this only if the hostname or API key changes.
        </Text>

        <Text style={styles.label}>SERVER URL</Text>
        <TextInput
          value={url}
          onChangeText={(t) => { setUrl(t); setTest({ kind: 'idle' }); }}
          placeholder={DEFAULT_SERVER_URL}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />

        <Text style={styles.label}>API KEY</Text>
        <View style={styles.keyRow}>
          <TextInput
            value={key}
            onChangeText={(t) => { setKey(t); setTest({ kind: 'idle' }); }}
            placeholder="shared secret"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showKey}
            style={[styles.input, styles.keyInput]}
          />
          <TouchableOpacity onPress={() => setShowKey((v) => !v)} style={styles.eye} accessibilityLabel="Toggle key visibility">
            <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.testRow}>
          <TouchableOpacity onPress={runTest} style={styles.secondaryBtn} disabled={test.kind === 'testing'}>
            <Text style={styles.secondaryText}>{test.kind === 'testing' ? 'Testing…' : 'Test connection'}</Text>
          </TouchableOpacity>
          {test.kind === 'ok' && (
            <View style={styles.result}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[styles.resultText, { color: colors.success }]}>Connected</Text>
            </View>
          )}
          {test.kind === 'fail' && (
            <View style={styles.result}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.resultText, { color: colors.error }]}>{test.error}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity onPress={save} style={styles.primaryBtn} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>

        {isCustom && (
          <TouchableOpacity onPress={reset} style={styles.resetBtn}>
            <Text style={styles.resetText}>Reset to default</Text>
          </TouchableOpacity>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...typography.serifTitle, marginTop: 4 },
  help: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  label: { ...typography.micro, color: colors.textTertiary, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  keyInput: { flex: 1 },
  eye: { padding: 8 },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.accentMuted,
  },
  secondaryText: { color: colors.accentLight, fontFamily: fonts.semibold, fontSize: 13 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  resultText: { fontFamily: fonts.medium, fontSize: 13, flexShrink: 1 },
  primaryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: colors.bg, fontFamily: fonts.semibold, fontSize: 15 },
  resetBtn: { alignItems: 'center', paddingVertical: 10 },
  resetText: { color: colors.textTertiary, fontFamily: fonts.medium, fontSize: 13 },
});
