/**
 * PillarDetailScreen — concept tree for a single pillar (P5-2).
 *
 * Displays 40-80 concepts organized in 5 collapsible tiers.
 * Status toggle (not_started → in_progress → mastered), add/edit/delete concepts.
 * Seed button triggers LLM generation when no concepts exist.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getPillarConcepts, seedPillarConcepts, updateConcept, addConcept, deleteConcept,
  getConceptLinks, getCrossPillarLinks, createConceptLink,
  ConceptTreeData, ConceptData, TierGroup, ConceptLinkData,
} from '../api/client';
import { haptic } from '../utils/haptics';
import ConceptGraph from '../components/ConceptGraph';
import { colors, spacing, typography, radius, cardStyle, PILLAR_COLORS } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import { Skeleton, SkeletonRow } from '../components/Skeleton';

const STATUS_CYCLE: ConceptData['status'][] = ['not_started', 'in_progress', 'mastered'];
const STATUS_COLORS: Record<string, string> = {
  not_started: colors.textTertiary,
  in_progress: colors.warning,
  mastered: colors.success,
};
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  mastered: 'Mastered',
};
const TIER_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  1: 'layers-outline',
  2: 'book-outline',
  3: 'rocket-outline',
  4: 'diamond-outline',
  5: 'planet-outline',
};

export default function PillarDetailScreen({ route, navigation }: any) {
  const { pillarId, pillarName } = route.params;
  const insets = useSafeAreaInsets();
  const pillarColor = PILLAR_COLORS[pillarId] || colors.accent;

  const [tree, setTree] = useState<ConceptTreeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Set<number>>(new Set([1]));
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [addingToTier, setAddingToTier] = useState<number | null>(null);
  const [newConceptName, setNewConceptName] = useState('');
  const [seedMode, setSeedMode] = useState<'quick' | 'research'>('quick');
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [crossLinks, setCrossLinks] = useState<ConceptLinkData[]>([]);

  const fetchTree = useCallback(async () => {
    try {
      const [data, links] = await Promise.all([
        getPillarConcepts(pillarId),
        getCrossPillarLinks().catch(() => [] as ConceptLinkData[]),
      ]);
      setTree(data);
      setCrossLinks(links);
      // Auto-expand tiers that have concepts
      const nonEmpty = new Set(data.tiers.filter(t => t.concepts.length > 0).map(t => t.tier));
      if (nonEmpty.size > 0) setExpandedTiers(nonEmpty);
    } catch (err) {
      console.warn('Failed to fetch concepts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pillarId]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const handleSeed = async (mode: 'quick' | 'research' = 'quick') => {
    setSeedMode(mode);
    setSeeding(true);
    try {
      const data = await seedPillarConcepts(pillarId, mode);
      setTree(data);
      const nonEmpty = new Set(data.tiers.filter(t => t.concepts.length > 0).map(t => t.tier));
      setExpandedTiers(nonEmpty);
      haptic.success();
    } catch (err) {
      Alert.alert('Seeding Failed', 'Could not generate concepts. Make sure Clawdbot is running.');
      console.warn('Seed failed:', err);
    } finally {
      setSeeding(false);
    }
  };

  const confirmReseed = () => {
    Alert.alert(
      'Re-seed Concepts?',
      'This will delete all existing concepts and regenerate from scratch. Your notes and status will be lost.\n\nChoose seeding mode:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '⚡ Quick', onPress: () => handleSeed('quick') },
        { text: '🔬 Research', style: 'destructive', onPress: () => handleSeed('research') },
      ],
    );
  };

  const toggleTier = (tier: number) => {
    setExpandedTiers(prev => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });
    haptic.selection();
  };

  const cycleStatus = async (concept: ConceptData) => {
    const currentIdx = STATUS_CYCLE.indexOf(concept.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];

    // Optimistic update
    setTree(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        mastered: prev.mastered + (nextStatus === 'mastered' ? 1 : 0) - (concept.status === 'mastered' ? 1 : 0),
        in_progress: prev.in_progress + (nextStatus === 'in_progress' ? 1 : 0) - (concept.status === 'in_progress' ? 1 : 0),
        tiers: prev.tiers.map(t => ({
          ...t,
          concepts: t.concepts.map(c =>
            c.id === concept.id ? { ...c, status: nextStatus } : c,
          ),
        })),
      };
    });
    haptic.light();

    try {
      await updateConcept(pillarId, concept.id, { status: nextStatus });
    } catch (err) {
      console.warn('Failed to update status:', err);
      fetchTree(); // Rollback
    }
  };

  const handleAddConcept = async (tier: number) => {
    const name = newConceptName.trim();
    if (!name) return;

    try {
      const created = await addConcept(pillarId, { name, tier });
      setTree(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          total: prev.total + 1,
          tiers: prev.tiers.map(t =>
            t.tier === tier ? { ...t, concepts: [...t.concepts, created] } : t,
          ),
        };
      });
      setNewConceptName('');
      setAddingToTier(null);
      haptic.light();
    } catch (err) {
      console.warn('Failed to add concept:', err);
    }
  };

  const handleDelete = (concept: ConceptData) => {
    Alert.alert(
      'Delete Concept?',
      `Remove "${concept.name}" from your concept tree?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setTree(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                total: prev.total - 1,
                mastered: prev.mastered - (concept.status === 'mastered' ? 1 : 0),
                in_progress: prev.in_progress - (concept.status === 'in_progress' ? 1 : 0),
                tiers: prev.tiers.map(t => ({
                  ...t,
                  concepts: t.concepts.filter(c => c.id !== concept.id),
                })),
              };
            });
            try {
              await deleteConcept(pillarId, concept.id);
              haptic.light();
            } catch (err) {
              console.warn('Failed to delete:', err);
              fetchTree();
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[st.center, { padding: spacing.lg, justifyContent: 'flex-start', paddingTop: 60 }]}>
        <Skeleton width="50%" height={24} style={{ marginBottom: spacing.sm }} />
        <Skeleton width="30%" height={14} style={{ marginBottom: spacing.lg }} />
        <Skeleton width="100%" height={6} borderRadius={3} style={{ marginBottom: spacing.lg }} />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  const isEmpty = !tree || tree.total === 0;
  const progressPct = tree && tree.total > 0 ? Math.round((tree.mastered / tree.total) * 100) : 0;

  return (
    <ScreenBackground>
    <ScrollView
      style={st.scroll}
      contentContainerStyle={[st.container, { paddingTop: spacing.sm }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTree(); }} tintColor={colors.textTertiary} />
      }
    >
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={[st.title, { color: pillarColor }]}>{pillarName}</Text>
          <Text style={st.subtitle}>Concept Tree</Text>
        </View>
        {!isEmpty && (
          <TouchableOpacity onPress={confirmReseed} style={st.reseedBtn}>
            <Ionicons name="refresh" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Progress bar */}
      {!isEmpty && tree && (
        <View style={st.progressSection}>
          <View style={st.progressStats}>
            <Text style={st.progressPct}>{progressPct}%</Text>
            <Text style={st.progressLabel}>mastered</Text>
            <View style={{ flex: 1 }} />
            <Text style={st.progressMeta}>
              {tree.mastered} <Text style={{ color: colors.success }}>✓</Text>
              {'  '}{tree.in_progress} <Text style={{ color: colors.warning }}>◉</Text>
              {'  '}{tree.total - tree.mastered - tree.in_progress} <Text style={{ color: colors.textTertiary }}>○</Text>
            </Text>
          </View>
          <View style={st.progressBarTrack}>
            <View style={[st.progressBarFill, { width: `${progressPct}%` as any, backgroundColor: pillarColor }]} />
          </View>
        </View>
      )}

      {/* Empty state with seed buttons */}
      {isEmpty && (
        <View style={st.emptyState}>
          <Ionicons name="git-branch-outline" size={64} color={colors.textTertiary} />
          <Text style={st.emptyTitle}>No concepts yet</Text>
          <Text style={st.emptySubtitle}>
            Generate a personalized concept tree using AI, based on your Vision and pillar targets.
          </Text>

          {/* Quick seed */}
          <TouchableOpacity
            style={[st.seedBtn, { backgroundColor: pillarColor }]}
            onPress={() => handleSeed('quick')}
            disabled={seeding}
          >
            {seeding && seedMode === 'quick' ? (
              <Skeleton width={80} height={18} />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={st.seedBtnText}>Quick Seed</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={st.seedModeHint}>Vision-only context · ~15 seconds</Text>

          {/* Research seed */}
          <TouchableOpacity
            style={[st.seedBtn, st.seedBtnResearch]}
            onPress={() => handleSeed('research')}
            disabled={seeding}
          >
            {seeding && seedMode === 'research' ? (
              <Skeleton width={120} height={18} />
            ) : (
              <>
                <Ionicons name="telescope" size={18} color="#fff" />
                <Text style={st.seedBtnText}>Deep Research Seed</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={st.seedModeHint}>
            Notion KB + Web Research + Vision · ~60 seconds
          </Text>

          {seeding && (
            <Text style={st.seedingHint}>
              {seedMode === 'research'
                ? 'Scanning Notion KB → Web research → Synthesizing concepts...'
                : 'Generating 40-80 concepts...'}
            </Text>
          )}
        </View>
      )}

      {/* Seeding overlay for re-seed */}
      {seeding && !isEmpty && (
        <View style={st.seedingOverlay}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <Text style={st.seedingText}>
            {seedMode === 'research'
              ? 'Deep research mode: Notion KB → Web search → Synthesis...'
              : 'Re-seeding concept tree...'}
          </Text>
          <Text style={st.seedingHint}>
            {seedMode === 'research' ? 'This takes ~60 seconds' : '~15 seconds'}
          </Text>
        </View>
      )}

      {/* View toggle: List | Graph */}
      {!isEmpty && tree && (
        <View style={st.viewToggle}>
          <TouchableOpacity
            style={[st.viewToggleBtn, viewMode === 'list' && st.viewToggleBtnActive]}
            onPress={() => { setViewMode('list'); haptic.selection(); }}
          >
            <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? colors.accent : colors.textTertiary} />
            <Text style={[st.viewToggleText, viewMode === 'list' && st.viewToggleTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.viewToggleBtn, viewMode === 'graph' && st.viewToggleBtnActive]}
            onPress={() => { setViewMode('graph'); haptic.selection(); }}
          >
            <Ionicons name="git-network-outline" size={16} color={viewMode === 'graph' ? colors.accent : colors.textTertiary} />
            <Text style={[st.viewToggleText, viewMode === 'graph' && st.viewToggleTextActive]}>Graph</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Graph view */}
      {!isEmpty && tree && viewMode === 'graph' && (
        <ConceptGraph
          concepts={tree.tiers.flatMap(t => t.concepts)}
          pillarColor={pillarColor}
          crossLinks={crossLinks}
          onConceptTap={(concept) => setExpandedConcept(expandedConcept === concept.id ? null : concept.id)}
          onStatusChange={async (conceptId, newStatus) => {
            const concept = tree.tiers.flatMap(t => t.concepts).find(c => c.id === conceptId);
            if (concept) {
              await updateConcept(pillarId, conceptId, { status: newStatus as any });
              fetchTree();
            }
          }}
        />
      )}

      {/* Tier sections (list view) */}
      {!isEmpty && tree && viewMode === 'list' && tree.tiers.map(tierGroup => (
        <TierSection
          key={tierGroup.tier}
          tierGroup={tierGroup}
          pillarId={pillarId}
          pillarColor={pillarColor}
          expanded={expandedTiers.has(tierGroup.tier)}
          onToggle={() => toggleTier(tierGroup.tier)}
          expandedConcept={expandedConcept}
          onToggleConcept={(id) => setExpandedConcept(expandedConcept === id ? null : id)}
          onCycleStatus={cycleStatus}
          onDelete={handleDelete}
          addingToTier={addingToTier}
          onStartAdd={(tier) => { setAddingToTier(tier); setNewConceptName(''); }}
          onCancelAdd={() => setAddingToTier(null)}
          newConceptName={newConceptName}
          onChangeNewName={setNewConceptName}
          onSubmitAdd={handleAddConcept}
          crossLinks={crossLinks}
        />
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
    </ScreenBackground>
  );
}

// --- Tier Section Component ---

function TierSection({
  tierGroup, pillarId, pillarColor, expanded, onToggle,
  expandedConcept, onToggleConcept, onCycleStatus, onDelete,
  addingToTier, onStartAdd, onCancelAdd, newConceptName, onChangeNewName, onSubmitAdd,
  crossLinks,
}: {
  tierGroup: TierGroup;
  pillarId: number;
  pillarColor: string;
  expanded: boolean;
  onToggle: () => void;
  expandedConcept: number | null;
  onToggleConcept: (id: number) => void;
  onCycleStatus: (c: ConceptData) => void;
  onDelete: (c: ConceptData) => void;
  addingToTier: number | null;
  onStartAdd: (tier: number) => void;
  onCancelAdd: () => void;
  newConceptName: string;
  onChangeNewName: (t: string) => void;
  onSubmitAdd: (tier: number) => void;
  crossLinks?: ConceptLinkData[];
}) {
  const count = tierGroup.concepts.length;
  const mastered = tierGroup.concepts.filter(c => c.status === 'mastered').length;
  const tierIcon = TIER_ICONS[tierGroup.tier] || 'ellipse-outline';

  return (
    <View style={st.tierCard}>
      <TouchableOpacity style={st.tierHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={st.tierHeaderLeft}>
          <Ionicons name={tierIcon} size={18} color={pillarColor} />
          <Text style={st.tierTitle}>
            Tier {tierGroup.tier} — {tierGroup.tier_name}
          </Text>
        </View>
        <View style={st.tierHeaderRight}>
          {count > 0 && (
            <Text style={st.tierCount}>
              {mastered}/{count}
            </Text>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>

      {/* Tier progress bar */}
      {count > 0 && (
        <View style={st.tierBarTrack}>
          <View style={[st.tierBarFill, {
            width: `${count > 0 ? (mastered / count) * 100 : 0}%` as any,
            backgroundColor: pillarColor,
          }]} />
        </View>
      )}

      {expanded && (
        <>
          {tierGroup.concepts.map((concept) => {
            // Find cross-pillar links for this concept
            const conceptLinks = (crossLinks || []).filter(
              l => l.concept_id_a === concept.id || l.concept_id_b === concept.id,
            );
            return (
              <ConceptRow
                key={concept.id}
                concept={concept}
                expanded={expandedConcept === concept.id}
                onToggle={() => onToggleConcept(concept.id)}
                onCycleStatus={() => onCycleStatus(concept)}
                onDelete={() => onDelete(concept)}
                pillarColor={pillarColor}
                crossLinks={conceptLinks}
              />
            );
          })}

          {/* Add concept */}
          {addingToTier === tierGroup.tier ? (
            <View style={st.addConceptRow}>
              <TextInput
                style={st.addConceptInput}
                value={newConceptName}
                onChangeText={onChangeNewName}
                placeholder="Concept name..."
                placeholderTextColor={colors.textTertiary}
                autoFocus
                onSubmitEditing={() => onSubmitAdd(tierGroup.tier)}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={() => onSubmitAdd(tierGroup.tier)}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancelAdd}>
                <Ionicons name="close-circle" size={24} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={st.addBtn} onPress={() => onStartAdd(tierGroup.tier)}>
              <Ionicons name="add" size={16} color={colors.textTertiary} />
              <Text style={st.addBtnText}>Add concept</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

// --- Concept Row Component ---

function ConceptRow({
  concept, expanded, onToggle, onCycleStatus, onDelete, pillarColor, crossLinks,
}: {
  concept: ConceptData;
  expanded: boolean;
  onToggle: () => void;
  onCycleStatus: () => void;
  onDelete: () => void;
  pillarColor: string;
  crossLinks?: ConceptLinkData[];
}) {
  const statusColor = STATUS_COLORS[concept.status] || colors.textTertiary;

  // Cross-pillar link badges
  const linkedPillars = (crossLinks || []).map(link => {
    // Show the "other" pillar name
    if (link.concept_id_a === concept.id) return link.pillar_b_name;
    return link.pillar_a_name;
  }).filter(Boolean);

  return (
    <View style={st.conceptItem}>
      <View style={st.conceptMain}>
        {/* Status dot — tap to cycle */}
        <TouchableOpacity onPress={onCycleStatus} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <View style={[st.statusDot, {
            backgroundColor: concept.status === 'not_started' ? 'transparent' : statusColor,
            borderColor: statusColor,
          }]}>
            {concept.status === 'mastered' && (
              <Ionicons name="checkmark" size={10} color="#fff" />
            )}
          </View>
        </TouchableOpacity>

        {/* Name — tap to expand */}
        <TouchableOpacity onPress={onToggle} style={{ flex: 1 }}>
          <Text style={[
            st.conceptName,
            concept.status === 'mastered' && st.conceptNameMastered,
          ]}>
            {concept.name}
          </Text>
          {/* Cross-pillar badges */}
          {linkedPillars.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
              {linkedPillars.map((pName, i) => (
                <View key={i} style={st.crossLinkBadge}>
                  <Ionicons name="link" size={9} color="#F59E0B" />
                  <Text style={st.crossLinkText}>Also in: {pName}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>

        {/* Status label */}
        <Text style={[st.statusLabel, { color: statusColor }]}>
          {STATUS_LABELS[concept.status]}
        </Text>
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={st.conceptDetails}>
          {concept.description && (
            <Text style={st.detailText}>{concept.description}</Text>
          )}

          {concept.prerequisites && concept.prerequisites.length > 0 && (
            <View style={st.detailRow}>
              <Ionicons name="git-branch-outline" size={14} color={colors.textTertiary} />
              <Text style={st.detailLabel}>Prerequisites: </Text>
              <Text style={st.detailValue}>{concept.prerequisites.join(', ')}</Text>
            </View>
          )}

          {concept.key_resources && (
            <View style={st.detailRow}>
              <Ionicons name="book-outline" size={14} color={colors.textTertiary} />
              <Text style={st.detailLabel}>Resources: </Text>
              <Text style={st.detailValue}>{concept.key_resources}</Text>
            </View>
          )}

          {concept.notes && (
            <View style={st.detailRow}>
              <Ionicons name="document-text-outline" size={14} color={colors.textTertiary} />
              <Text style={st.detailLabel}>Notes: </Text>
              <Text style={st.detailValue}>{concept.notes}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={st.conceptActions}>
            <TouchableOpacity onPress={onCycleStatus} style={st.actionBtn}>
              <Ionicons name="swap-horizontal" size={14} color={colors.accent} />
              <Text style={[st.actionBtnText, { color: colors.accent }]}>Change Status</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={st.actionBtn}>
              <Ionicons name="trash-outline" size={14} color={colors.error} />
              <Text style={[st.actionBtnText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// --- Styles ---

const st = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title2,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  reseedBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  // Progress
  progressSection: {
    marginBottom: spacing.lg,
  },
  progressStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  progressPct: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  progressLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
  },
  progressMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.title3,
    color: colors.text,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  seedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  seedBtnText: {
    ...typography.bodyBold,
    color: '#fff',
  },
  seedBtnResearch: {
    backgroundColor: '#7c3aed',
    marginTop: spacing.md,
  },
  seedModeHint: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 2,
  },
  seedingHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },

  // Seeding overlay
  seedingOverlay: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  seedingText: {
    ...typography.body,
    color: colors.textTertiary,
  },

  // Tier card
  tierCard: {
    ...cardStyle,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  tierHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tierTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  tierCount: {
    ...typography.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  tierBarTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: spacing.sm,
  },
  tierBarFill: {
    height: '100%',
    borderRadius: 1.5,
  },

  // Concept item
  conceptItem: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
  },
  conceptMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conceptName: {
    ...typography.body,
    color: colors.text,
  },
  conceptNameMastered: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  statusLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
  },

  // Concept details (expanded)
  conceptDetails: {
    marginTop: spacing.sm,
    marginLeft: 28, // align with name (past status dot)
    gap: spacing.sm,
  },
  detailText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  detailValue: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  conceptActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionBtnText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Add concept
  addConceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addConceptInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.input,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addBtnText: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // View toggle
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.accentMuted,
  },
  viewToggleText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  viewToggleTextActive: {
    color: colors.accent,
  },

  // Cross-pillar link badges
  crossLinkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  crossLinkText: {
    fontSize: 9,
    color: '#F59E0B',
    fontWeight: '600',
  },
});
