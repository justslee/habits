/**
 * Daily Check-In Screen — TASK-004
 *
 * Minimal, speed-focused form for logging daily mastery activities.
 * Designed to be completed in under 3 minutes.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { createEntry, suggestTags, PillarSuggestion } from '../api/client';

const PILLARS = [
  { id: 1, name: 'Quant Finance', short: 'QF' },
  { id: 2, name: 'Macro Investing', short: 'MI' },
  { id: 3, name: 'ML Math', short: 'ML' },
  { id: 4, name: 'AI Engineering', short: 'AI' },
  { id: 5, name: 'Public Speaking', short: 'PS' },
] as const;

export default function CheckInScreen() {
  // Form state
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [takeaway, setTakeaway] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [suggestions, setSuggestions] = useState<PillarSuggestion[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const descriptionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-suggest tags when description changes (debounced)
  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    if (descriptionTimeout.current) clearTimeout(descriptionTimeout.current);
    if (text.length >= 20) {
      descriptionTimeout.current = setTimeout(async () => {
        setSuggestingTags(true);
        try {
          const res = await suggestTags(text);
          setSuggestions(res.suggestions);
          // Auto-select high-confidence suggestions if user hasn't manually selected
          if (selectedPillars.length === 0) {
            const autoIds = res.suggestions
              .filter((s) => s.confidence >= 0.6)
              .map((s) => s.pillar_id);
            if (autoIds.length > 0) setSelectedPillars(autoIds);
          }
        } catch {
          // Silent fail on suggestion — not critical
        } finally {
          setSuggestingTags(false);
        }
      }, 1000);
    }
  }, [selectedPillars.length]);

  const togglePillar = (id: number) => {
    setSelectedPillars((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const totalMinutes = (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0);

  const handleSubmit = async () => {
    // Validation
    if (!description.trim()) return Alert.alert('Required', 'Describe what you worked on.');
    if (totalMinutes <= 0) return Alert.alert('Required', 'Enter time invested.');
    if (!takeaway.trim()) return Alert.alert('Required', 'Add a key takeaway.');

    setSubmitting(true);
    try {
      await createEntry({
        description: description.trim(),
        time_invested_minutes: totalMinutes,
        pillar_tags: selectedPillars,
        difficulty_rating: difficulty,
        energy_level: energy,
        key_takeaway: takeaway.trim(),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Submission Failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setDescription('');
    setHours('');
    setMinutes('');
    setSelectedPillars([]);
    setDifficulty(5);
    setEnergy(5);
    setTakeaway('');
    setSuggestions([]);
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successEmoji}>✅</Text>
        <Text style={styles.successTitle}>Logged!</Text>
        <Text style={styles.successSub}>Entry submitted for evaluation.</Text>
        <TouchableOpacity style={styles.submitBtn} onPress={resetForm}>
          <Text style={styles.submitBtnText}>Log Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Daily Check-In</Text>

      {/* Description */}
      <Text style={styles.label}>What did you work on?</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Studied stochastic calculus proofs, built a vol surface model..."
        placeholderTextColor="#999"
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={handleDescriptionChange}
        testID="description-input"
      />

      {/* Time */}
      <Text style={styles.label}>Time invested</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={[styles.input, styles.timeInput]}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          value={hours}
          onChangeText={setHours}
          testID="hours-input"
        />
        <Text style={styles.timeLabel}>h</Text>
        <TextInput
          style={[styles.input, styles.timeInput]}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          value={minutes}
          onChangeText={setMinutes}
          testID="minutes-input"
        />
        <Text style={styles.timeLabel}>m</Text>
      </View>

      {/* Pillar Tags */}
      <Text style={styles.label}>
        Pillars{' '}
        {suggestingTags && <ActivityIndicator size="small" color="#666" />}
      </Text>
      {suggestions.length > 0 && selectedPillars.length === 0 && (
        <Text style={styles.hint}>
          Suggested:{' '}
          {suggestions
            .filter((s) => s.confidence >= 0.4)
            .map((s) => s.pillar_name)
            .join(', ')}
        </Text>
      )}
      <View style={styles.pillarRow}>
        {PILLARS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.pillarChip,
              selectedPillars.includes(p.id) && styles.pillarChipActive,
            ]}
            onPress={() => togglePillar(p.id)}
            testID={`pillar-${p.id}`}
          >
            <Text
              style={[
                styles.pillarChipText,
                selectedPillars.includes(p.id) && styles.pillarChipTextActive,
              ]}
            >
              {p.short}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Difficulty Slider */}
      <Text style={styles.label}>Difficulty / Depth: {difficulty}</Text>
      <View style={styles.sliderRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.sliderDot, difficulty >= n && styles.sliderDotActive]}
            onPress={() => setDifficulty(n)}
            testID={`difficulty-${n}`}
          >
            <Text style={[styles.sliderNum, difficulty >= n && styles.sliderNumActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Energy Slider */}
      <Text style={styles.label}>Energy / Focus: {energy}</Text>
      <View style={styles.sliderRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.sliderDot, energy >= n && styles.sliderDotActive]}
            onPress={() => setEnergy(n)}
            testID={`energy-${n}`}
          >
            <Text style={[styles.sliderNum, energy >= n && styles.sliderNumActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Key Takeaway */}
      <Text style={styles.label}>Key takeaway</Text>
      <TextInput
        style={styles.input}
        placeholder="One sentence — most important thing learned"
        placeholderTextColor="#999"
        value={takeaway}
        onChangeText={setTakeaway}
        testID="takeaway-input"
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        testID="submit-btn"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Log Entry</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#000' },
  container: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#aaa', marginBottom: 8, marginTop: 16 },
  hint: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { width: 60, textAlign: 'center' },
  timeLabel: { fontSize: 16, color: '#aaa' },
  pillarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillarChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  pillarChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  pillarChipText: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  pillarChipTextActive: { color: '#fff' },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  sliderDotActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  sliderNum: { color: '#666', fontSize: 12, fontWeight: '600' },
  sliderNumActive: { color: '#fff' },
  submitBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  successContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  successEmoji: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 32, fontWeight: '700', color: '#fff', marginBottom: 8 },
  successSub: { fontSize: 16, color: '#aaa', marginBottom: 32 },
});
