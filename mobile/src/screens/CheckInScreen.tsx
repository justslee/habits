import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createEntry, suggestTags, PillarSuggestion } from '../api/client';
import { colors, spacing, typography, radius, cardStyle } from '../theme';

const PILLARS = [
  { id: 1, name: 'Quant Finance', short: 'QF', color: colors.pillarQuant },
  { id: 2, name: 'Macro Investing', short: 'MI', color: colors.pillarMacro },
  { id: 3, name: 'ML Math', short: 'ML', color: colors.pillarML },
  { id: 4, name: 'AI Engineering', short: 'AI', color: colors.pillarAI },
  { id: 5, name: 'Public Speaking', short: 'PS', color: colors.pillarSpeaking },
] as const;

const TIME_PRESETS = ['15m', '30m', '1h', '1.5h', '2h', '3h', '4h+'];
const TIME_MINUTES: Record<string, number> = { '15m': 15, '30m': 30, '1h': 60, '1.5h': 90, '2h': 120, '3h': 180, '4h+': 240 };

export default function CheckInScreen() {
  const [description, setDescription] = useState('');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [takeaway, setTakeaway] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [suggestions, setSuggestions] = useState<PillarSuggestion[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const descriptionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    if (descriptionTimeout.current) clearTimeout(descriptionTimeout.current);
    if (text.length >= 20) {
      descriptionTimeout.current = setTimeout(async () => {
        setSuggestingTags(true);
        try {
          const res = await suggestTags(text);
          setSuggestions(res.suggestions);
          if (selectedPillars.length === 0) {
            const autoIds = res.suggestions.filter((s) => s.confidence >= 0.6).map((s) => s.pillar_id);
            if (autoIds.length > 0) setSelectedPillars(autoIds);
          }
        } catch {} finally { setSuggestingTags(false); }
      }, 1000);
    }
  }, [selectedPillars.length]);

  const togglePillar = (id: number) => {
    setSelectedPillars(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const totalMinutes = selectedTime ? TIME_MINUTES[selectedTime] || parseInt(customMinutes, 10) || 0 : parseInt(customMinutes, 10) || 0;

  const handleSubmit = async () => {
    if (!description.trim()) return Alert.alert('Required', 'Describe what you worked on.');
    if (totalMinutes <= 0) return Alert.alert('Required', 'Select time invested.');
    if (!takeaway.trim()) return Alert.alert('Required', 'Add a key takeaway.');
    setSubmitting(true);
    try {
      await createEntry({
        description: description.trim(), time_invested_minutes: totalMinutes,
        pillar_tags: selectedPillars, difficulty_rating: difficulty,
        energy_level: energy, key_takeaway: takeaway.trim(),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setDescription(''); setSelectedTime(null); setCustomMinutes('');
    setSelectedPillars([]); setDifficulty(5); setEnergy(5);
    setTakeaway(''); setSuggestions([]); setSubmitted(false);
  };

  if (submitted) {
    return (
      <View style={s.successContainer}>
        <View style={s.successRing}>
          <Ionicons name="checkmark" size={40} color={colors.success} />
        </View>
        <Text style={s.successTitle}>Logged</Text>
        <Text style={s.successSub}>Entry submitted for evaluation</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={resetForm}>
          <Text style={s.primaryBtnText}>Log Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Text style={s.greeting}>Check-In</Text>

      {/* Description */}
      <Text style={s.label}>WHAT DID YOU WORK ON</Text>
      <TextInput
        style={s.textArea} placeholder="Studied stochastic calculus, built a vol surface model..."
        placeholderTextColor={colors.textTertiary} multiline numberOfLines={4}
        value={description} onChangeText={handleDescriptionChange} testID="description-input"
      />

      {/* Time */}
      <Text style={s.label}>TIME INVESTED</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.presetsScroll}>
        {TIME_PRESETS.map(t => (
          <TouchableOpacity key={t}
            style={[s.presetPill, selectedTime === t && s.presetPillActive]}
            onPress={() => { setSelectedTime(t); setCustomMinutes(''); }}>
            <Text style={[s.presetText, selectedTime === t && s.presetTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Pillars */}
      <Text style={s.label}>
        PILLARS{suggestingTags ? '  ...' : ''}
      </Text>
      <View style={s.pillarRow}>
        {PILLARS.map(p => (
          <TouchableOpacity key={p.id}
            style={[s.pillarChip, selectedPillars.includes(p.id) && { backgroundColor: p.color + '20', borderColor: p.color }]}
            onPress={() => togglePillar(p.id)} testID={`pillar-${p.id}`}>
            <View style={[s.pillarDot, { backgroundColor: selectedPillars.includes(p.id) ? p.color : colors.textTertiary }]} />
            <Text style={[s.pillarText, selectedPillars.includes(p.id) && { color: colors.text }]}>{p.short}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Difficulty */}
      <Text style={s.label}>DIFFICULTY  <Text style={{ color: colors.accent }}>{difficulty}</Text>/10</Text>
      <View style={s.sliderTrack}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[s.sliderSegment,
            difficulty >= n && { backgroundColor: colors.accent },
            n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
            n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
          ]} onPress={() => setDifficulty(n)} testID={`difficulty-${n}`} />
        ))}
      </View>

      {/* Energy */}
      <Text style={s.label}>ENERGY  <Text style={{ color: colors.success }}>{energy}</Text>/10</Text>
      <View style={s.sliderTrack}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[s.sliderSegment,
            energy >= n && { backgroundColor: colors.success },
            n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
            n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
          ]} onPress={() => setEnergy(n)} testID={`energy-${n}`} />
        ))}
      </View>

      {/* Takeaway */}
      <Text style={s.label}>KEY TAKEAWAY</Text>
      <TextInput style={s.input}
        placeholder="One sentence — most important thing learned"
        placeholderTextColor={colors.textTertiary}
        value={takeaway} onChangeText={setTakeaway} testID="takeaway-input" />

      {/* Submit */}
      <TouchableOpacity style={[s.primaryBtn, submitting && { opacity: 0.5 }]}
        onPress={handleSubmit} disabled={submitting} testID="submit-btn">
        {submitting ? <ActivityIndicator color={colors.text} /> : <Text style={s.primaryBtnText}>Log Entry</Text>}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: Platform.OS === 'ios' ? 68 : 48 },
  greeting: { ...typography.title1, color: colors.text, marginBottom: spacing.xl },

  label: {
    ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.lg,
  },

  textArea: {
    backgroundColor: colors.input, color: colors.text, borderRadius: radius.lg,
    padding: spacing.lg, fontSize: 15, minHeight: 120, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.border,
  },
  input: {
    backgroundColor: colors.input, color: colors.text, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },

  presetsScroll: { marginBottom: spacing.xs },
  presetPill: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill, backgroundColor: colors.input,
    marginRight: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  presetPillActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  presetText: { ...typography.bodyBold, color: colors.textTertiary },
  presetTextActive: { color: colors.accent },

  pillarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pillarChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill, backgroundColor: colors.input,
    borderWidth: 1, borderColor: colors.border,
  },
  pillarDot: { width: 8, height: 8, borderRadius: 4 },
  pillarText: { ...typography.caption, color: colors.textTertiary },

  sliderTrack: { flexDirection: 'row', gap: 3, marginBottom: spacing.xs },
  sliderSegment: { flex: 1, height: 28, backgroundColor: colors.input },

  primaryBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 18, alignItems: 'center', marginTop: spacing.xl,
  },
  primaryBtnText: { ...typography.bodyBold, color: colors.text },

  successContainer: {
    flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl,
  },
  successRing: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success + '15',
    borderWidth: 2, borderColor: colors.success + '40',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  successTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.sm },
  successSub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
});
