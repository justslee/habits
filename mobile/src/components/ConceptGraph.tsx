/**
 * ConceptGraph — Interactive SVG concept tree visualization.
 *
 * Renders pillar concepts as nodes in a tier-based vertical tree.
 * Supports pinch-to-zoom, pan, tap (concept detail), and double-tap (cycle status).
 * Uses react-native-svg for rendering and react-native-gesture-handler for gestures.
 */

import React, { useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G, Path } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import type { ConceptData, ConceptLinkData } from '../api/client';
import { colors, spacing, typography } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TIER_GAP = 130;
const NODE_RADIUS = 20;
const CANVAS_PADDING = 60;
const TIER_NAMES: Record<number, string> = {
  1: 'Foundation',
  2: 'Core',
  3: 'Advanced',
  4: 'Expert',
  5: 'Frontier',
};

const STATUS_CYCLE: ConceptData['status'][] = ['not_started', 'in_progress', 'mastered'];

interface ConceptGraphProps {
  concepts: ConceptData[];
  pillarColor: string;
  crossLinks: ConceptLinkData[];
  onConceptTap: (concept: ConceptData) => void;
  onStatusChange: (conceptId: number, newStatus: string) => void;
}

interface NodePosition {
  concept: ConceptData;
  x: number;
  y: number;
}

export default function ConceptGraph({
  concepts,
  pillarColor,
  crossLinks,
  onConceptTap,
  onStatusChange,
}: ConceptGraphProps) {
  // Group concepts by tier
  const tiers = useMemo(() => {
    const grouped: Record<number, ConceptData[]> = {};
    concepts.forEach(c => {
      if (!grouped[c.tier]) grouped[c.tier] = [];
      grouped[c.tier].push(c);
    });
    return grouped;
  }, [concepts]);

  // Calculate canvas dimensions
  const maxNodesInTier = Math.max(1, ...Object.values(tiers).map(arr => arr.length));
  const canvasWidth = Math.max(SCREEN_WIDTH - 32, maxNodesInTier * (NODE_RADIUS * 2 + 30) + CANVAS_PADDING * 2);
  const canvasHeight = 5 * TIER_GAP + CANVAS_PADDING * 2;

  // Position nodes
  const nodePositions = useMemo<NodePosition[]>(() => {
    const positions: NodePosition[] = [];
    for (let tier = 1; tier <= 5; tier++) {
      const tierConcepts = tiers[tier] || [];
      const count = tierConcepts.length;
      // Tier 1 at bottom, Tier 5 at top
      const y = canvasHeight - CANVAS_PADDING - (tier - 1) * TIER_GAP;
      tierConcepts.forEach((concept, index) => {
        const x = count === 1
          ? canvasWidth / 2
          : CANVAS_PADDING + (index / (count - 1)) * (canvasWidth - CANVAS_PADDING * 2);
        positions.push({ concept, x, y });
      });
    }
    return positions;
  }, [tiers, canvasWidth, canvasHeight]);

  // Build position lookup by concept id
  const positionMap = useMemo(() => {
    const map: Record<number, NodePosition> = {};
    nodePositions.forEach(np => { map[np.concept.id] = np; });
    return map;
  }, [nodePositions]);

  // Build prerequisite edges
  const prereqEdges = useMemo(() => {
    const edges: { from: NodePosition; to: NodePosition }[] = [];
    nodePositions.forEach(np => {
      const prereqs = np.concept.prerequisites || [];
      prereqs.forEach(prereqName => {
        // Find the prerequisite concept by name
        const prereqNode = nodePositions.find(other => other.concept.name === prereqName);
        if (prereqNode) {
          edges.push({ from: prereqNode, to: np });
        }
      });
    });
    return edges;
  }, [nodePositions]);

  // Build cross-pillar link edges
  const crossEdges = useMemo(() => {
    return crossLinks
      .map(link => {
        const a = positionMap[link.concept_id_a];
        const b = positionMap[link.concept_id_b];
        if (a && b) return { from: a, to: b, link };
        return null;
      })
      .filter(Boolean) as { from: NodePosition; to: NodePosition; link: ConceptLinkData }[];
  }, [crossLinks, positionMap]);

  // Gesture state
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(0.5, Math.min(3, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Handle node taps
  const handleTap = useCallback((concept: ConceptData) => {
    onConceptTap(concept);
  }, [onConceptTap]);

  const handleDoubleTap = useCallback((concept: ConceptData) => {
    const currentIdx = STATUS_CYCLE.indexOf(concept.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    onStatusChange(concept.id, nextStatus);
  }, [onStatusChange]);

  // Get node fill based on status
  const getNodeFill = (status: string) => {
    switch (status) {
      case 'mastered': return pillarColor;
      case 'in_progress': return pillarColor + '60';
      case 'not_started': default: return 'transparent';
    }
  };

  const getNodeStroke = (status: string) => {
    switch (status) {
      case 'mastered': return pillarColor;
      case 'in_progress': return pillarColor;
      case 'not_started': default: return colors.textTertiary;
    }
  };

  // Check if concept has cross-pillar links
  const hasXLink = useCallback((conceptId: number) => {
    return crossLinks.some(l => l.concept_id_a === conceptId || l.concept_id_b === conceptId);
  }, [crossLinks]);

  if (concepts.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No concepts to visualize</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { borderColor: colors.textTertiary, backgroundColor: 'transparent' }]} />
          <Text style={styles.legendText}>Not Started</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { borderColor: pillarColor, backgroundColor: pillarColor + '60' }]} />
          <Text style={styles.legendText}>In Progress</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { borderColor: pillarColor, backgroundColor: pillarColor }]} />
          <Text style={styles.legendText}>Mastered</Text>
        </View>
        {crossEdges.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { borderColor: '#F59E0B', backgroundColor: '#F59E0B30' }]} />
            <Text style={styles.legendText}>Cross-Pillar</Text>
          </View>
        )}
      </View>

      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.svgContainer, animatedStyle]}>
            <Svg width={canvasWidth} height={canvasHeight}>
              {/* Tier labels */}
              {[1, 2, 3, 4, 5].map(tier => {
                const y = canvasHeight - CANVAS_PADDING - (tier - 1) * TIER_GAP;
                return (
                  <SvgText
                    key={`tier-${tier}`}
                    x={12}
                    y={y + 4}
                    fill={colors.textTertiary}
                    fontSize={9}
                    fontWeight="600"
                    opacity={0.5}
                  >
                    T{tier}
                  </SvgText>
                );
              })}

              {/* Prerequisite edges */}
              {prereqEdges.map((edge, i) => {
                const dx = edge.to.x - edge.from.x;
                const dy = edge.to.y - edge.from.y;
                const midY = edge.from.y + dy * 0.5;
                const path = `M ${edge.from.x} ${edge.from.y - NODE_RADIUS} C ${edge.from.x} ${midY}, ${edge.to.x} ${midY}, ${edge.to.x} ${edge.to.y + NODE_RADIUS}`;
                return (
                  <Path
                    key={`prereq-${i}`}
                    d={path}
                    stroke={colors.textTertiary}
                    strokeWidth={1.5}
                    fill="none"
                    opacity={0.25}
                  />
                );
              })}

              {/* Cross-pillar link edges (dashed amber) */}
              {crossEdges.map((edge, i) => (
                <Line
                  key={`xlink-${i}`}
                  x1={edge.from.x}
                  y1={edge.from.y}
                  x2={edge.to.x}
                  y2={edge.to.y}
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  strokeDasharray="6,4"
                  opacity={0.5}
                />
              ))}

              {/* Nodes */}
              {nodePositions.map(np => {
                const isXLinked = hasXLink(np.concept.id);
                return (
                  <G key={np.concept.id}>
                    {/* Gold ring for cross-linked concepts */}
                    {isXLinked && (
                      <Circle
                        cx={np.x}
                        cy={np.y}
                        r={NODE_RADIUS + 4}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        opacity={0.5}
                      />
                    )}

                    {/* Node circle */}
                    <Circle
                      cx={np.x}
                      cy={np.y}
                      r={NODE_RADIUS}
                      fill={getNodeFill(np.concept.status)}
                      stroke={getNodeStroke(np.concept.status)}
                      strokeWidth={2}
                      onPress={() => handleTap(np.concept)}
                      onLongPress={() => handleDoubleTap(np.concept)}
                    />

                    {/* Checkmark for mastered */}
                    {np.concept.status === 'mastered' && (
                      <SvgText
                        x={np.x}
                        y={np.y + 5}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={14}
                        fontWeight="700"
                      >
                        ✓
                      </SvgText>
                    )}

                    {/* Label below node */}
                    <SvgText
                      x={np.x}
                      y={np.y + NODE_RADIUS + 14}
                      textAnchor="middle"
                      fill={colors.textSecondary}
                      fontSize={10}
                      fontWeight="500"
                    >
                      {np.concept.name.length > 16
                        ? np.concept.name.substring(0, 14) + '...'
                        : np.concept.name}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          Pinch to zoom · Drag to pan · Tap node for details · Long-press to cycle status
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  svgContainer: {
    minHeight: 5 * TIER_GAP + CANVAS_PADDING * 2,
    overflow: 'visible',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  legendText: {
    ...typography.micro,
    color: colors.textTertiary,
  },
  instructions: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  instructionText: {
    ...typography.micro,
    color: colors.textTertiary,
    fontSize: 10,
  },
});
