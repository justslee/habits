/**
 * ConceptGraph — Semantic Zoom with Cluster Expansion (P5-8).
 *
 * Force-directed layout where:
 * - Zoomed out: concepts grouped into tight tier clusters
 * - Zooming in: visible nodes dynamically repel, spreading apart
 * - Labels fade in progressively as nodes gain spacing (no overlap)
 * - Force params scale with zoom level
 * - Double-tap a tier cluster to quick-zoom-to-fit
 * - Node color = status, glow/opacity = confidence
 * - Prerequisite edges as curved lines, cross-pillar links as dashed amber
 * - Force sim on JS thread, rendering via React state batching
 */

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Circle, Line, Text as SvgText, G, Path, Defs, RadialGradient, Stop,
} from 'react-native-svg';
import {
  Gesture, GestureDetector, GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS,
} from 'react-native-reanimated';
import type { ConceptData, ConceptLinkData } from '../api/client';
import { colors, spacing, typography } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// --- Layout constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 900;
const NODE_RADIUS = 14;
const TIER_CENTERS_Y: Record<number, number> = {
  1: 780, // Foundation (bottom)
  2: 620,
  3: 460,
  4: 300,
  5: 140, // Frontier (top)
};
const TIER_NAMES: Record<number, string> = {
  1: 'Foundation',
  2: 'Core',
  3: 'Advanced',
  4: 'Expert',
  5: 'Frontier',
};
const STATUS_PRIORITY: Record<string, number> = {
  mastered: 3,
  in_progress: 2,
  not_started: 1,
};
const MAX_VISIBLE_LABELS = 18;

// --- Force simulation types ---
interface SimNode {
  id: number;
  concept: ConceptData;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tier: number;
  tierCenterX: number;
  tierCenterY: number;
}

interface ConceptGraphProps {
  concepts: ConceptData[];
  pillarColor: string;
  crossLinks: ConceptLinkData[];
  onConceptTap: (concept: ConceptData) => void;
  onStatusChange: (conceptId: number, newStatus: string) => void;
}

// --- Force simulation on JS thread ---
function createSimNodes(concepts: ConceptData[]): SimNode[] {
  const tierGroups: Record<number, ConceptData[]> = {};
  concepts.forEach(c => {
    if (!tierGroups[c.tier]) tierGroups[c.tier] = [];
    tierGroups[c.tier].push(c);
  });

  const nodes: SimNode[] = [];
  for (let tier = 1; tier <= 5; tier++) {
    const group = tierGroups[tier] || [];
    const count = group.length;
    const tierCenterX = CANVAS_WIDTH / 2;
    const tierCenterY = TIER_CENTERS_Y[tier];
    group.forEach((concept, i) => {
      // Initial position: spread in a small cluster around tier center
      const angle = count === 1 ? 0 : (2 * Math.PI * i) / count;
      const clusterRadius = Math.min(30, count * 4);
      nodes.push({
        id: concept.id,
        concept,
        x: tierCenterX + Math.cos(angle) * clusterRadius,
        y: tierCenterY + Math.sin(angle) * clusterRadius,
        vx: 0,
        vy: 0,
        tier,
        tierCenterX,
        tierCenterY,
      });
    });
  }
  return nodes;
}

function tickForce(nodes: SimNode[], zoom: number, alpha: number): SimNode[] {
  // Force parameters scale with zoom
  // Low zoom → strong cluster attraction, high zoom → strong repulsion
  const clusterStrength = Math.max(0.01, 0.15 * Math.pow(0.3, zoom - 0.5));
  const repulsionStrength = 800 * Math.pow(zoom, 1.8);
  const minDist = NODE_RADIUS * 2 + 4;
  const damping = 0.65;

  const updated = nodes.map(n => ({ ...n }));

  for (let i = 0; i < updated.length; i++) {
    const node = updated[i];

    // 1. Attraction toward tier center
    const dxCenter = node.tierCenterX - node.x;
    const dyCenter = node.tierCenterY - node.y;
    node.vx += dxCenter * clusterStrength * alpha;
    node.vy += dyCenter * clusterStrength * alpha;

    // 2. Repulsion from other nodes (stronger at high zoom)
    for (let j = i + 1; j < updated.length; j++) {
      const other = updated[j];
      let dx = node.x - other.x;
      let dy = node.y - other.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) { dx = 1; dy = 0; dist = 1; }

      // Same-tier nodes repel more strongly
      const sameTier = node.tier === other.tier ? 2.0 : 0.5;
      const force = (repulsionStrength * sameTier * alpha) / (dist * dist);

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      node.vx += fx;
      node.vy += fy;
      other.vx -= fx;
      other.vy -= fy;
    }
  }

  // Apply velocities with damping and clamp to canvas
  for (const node of updated) {
    node.vx *= damping;
    node.vy *= damping;
    node.x += node.vx;
    node.y += node.vy;
    // Clamp to canvas bounds
    node.x = Math.max(NODE_RADIUS + 20, Math.min(CANVAS_WIDTH - NODE_RADIUS - 20, node.x));
    node.y = Math.max(NODE_RADIUS + 20, Math.min(CANVAS_HEIGHT - NODE_RADIUS - 20, node.y));
  }

  return updated;
}

// --- Label visibility: progressive based on zoom + priority ---
function computeVisibleLabels(
  nodes: SimNode[],
  zoom: number,
): Set<number> {
  // At low zoom, show very few labels; at high zoom, show more
  const maxLabels = Math.min(MAX_VISIBLE_LABELS, Math.floor(3 + zoom * 8));

  // Sort by priority: mastered > in_progress > not_started
  const sorted = [...nodes].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.concept.status] || 0;
    const pb = STATUS_PRIORITY[b.concept.status] || 0;
    if (pb !== pa) return pb - pa;
    return a.concept.tier - b.concept.tier; // lower tier = more foundational
  });

  const visible = new Set<number>();
  const labelRects: { x: number; y: number; w: number }[] = [];

  // Estimate label width (rough: 6px per char at fontSize 10)
  const charWidth = 5.5;
  const labelHeight = 14;

  for (const node of sorted) {
    if (visible.size >= maxLabels) break;

    const labelW = Math.min(node.concept.name.length, 18) * charWidth;
    const labelX = node.x - labelW / 2;
    const labelY = node.y + NODE_RADIUS + 4;

    // Check overlap with existing labels
    let overlaps = false;
    for (const rect of labelRects) {
      const overlapX = Math.abs((labelX + labelW / 2) - (rect.x + rect.w / 2)) < (labelW + rect.w) / 2 + 4;
      const overlapY = Math.abs(labelY - rect.y) < labelHeight + 2;
      if (overlapX && overlapY) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      visible.add(node.id);
      labelRects.push({ x: labelX, y: labelY, w: labelW });
    }
  }

  return visible;
}

// --- Get label opacity based on zoom level ---
function getLabelOpacity(zoom: number): number {
  // Labels start appearing at zoom 0.7, fully opaque at zoom 1.5
  if (zoom < 0.7) return 0;
  if (zoom > 1.5) return 1;
  return (zoom - 0.7) / 0.8;
}

export default function ConceptGraph({
  concepts,
  pillarColor,
  crossLinks,
  onConceptTap,
  onStatusChange,
}: ConceptGraphProps) {
  // --- Force simulation state ---
  const [simNodes, setSimNodes] = useState<SimNode[]>(() => createSimNodes(concepts));
  const [currentZoom, setCurrentZoom] = useState(1);
  const simRef = useRef<SimNode[]>(simNodes);
  const frameRef = useRef<number>(0);
  const alphaRef = useRef(1.0);

  // Reset sim when concepts change
  useEffect(() => {
    const newNodes = createSimNodes(concepts);
    simRef.current = newNodes;
    alphaRef.current = 1.0;
    setSimNodes(newNodes);
  }, [concepts]);

  // Run force simulation loop
  useEffect(() => {
    let running = true;
    const step = () => {
      if (!running) return;
      if (alphaRef.current < 0.005) {
        // Sim has cooled — run at low rate for zoom changes
        frameRef.current = requestAnimationFrame(() => {
          if (!running) return;
          // Re-tick occasionally to respond to zoom changes
          const newNodes = tickForce(simRef.current, currentZoom, 0.02);
          simRef.current = newNodes;
          setSimNodes(newNodes);
          setTimeout(() => { if (running) step(); }, 200);
        });
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        if (!running) return;
        alphaRef.current *= 0.97;
        const newNodes = tickForce(simRef.current, currentZoom, alphaRef.current);
        simRef.current = newNodes;
        setSimNodes(newNodes);
        step();
      });
    };
    step();
    return () => { running = false; cancelAnimationFrame(frameRef.current); };
  }, [currentZoom]);

  // Re-heat simulation when zoom changes significantly
  const lastZoomRef = useRef(1);
  const reheatSim = useCallback((newZoom: number) => {
    if (Math.abs(newZoom - lastZoomRef.current) > 0.1) {
      alphaRef.current = Math.max(alphaRef.current, 0.3);
      lastZoomRef.current = newZoom;
    }
    setCurrentZoom(newZoom);
  }, []);

  // --- Computed data ---
  const positionMap = useMemo(() => {
    const map: Record<number, SimNode> = {};
    simNodes.forEach(n => { map[n.id] = n; });
    return map;
  }, [simNodes]);

  const prereqEdges = useMemo(() => {
    const edges: { from: SimNode; to: SimNode }[] = [];
    simNodes.forEach(n => {
      (n.concept.prerequisites || []).forEach(prereqName => {
        const prereqNode = simNodes.find(other => other.concept.name === prereqName);
        if (prereqNode) edges.push({ from: prereqNode, to: n });
      });
    });
    return edges;
  }, [simNodes]);

  const crossEdges = useMemo(() => {
    return crossLinks
      .map(link => {
        const a = positionMap[link.concept_id_a];
        const b = positionMap[link.concept_id_b];
        if (a && b) return { from: a, to: b, link };
        return null;
      })
      .filter(Boolean) as { from: SimNode; to: SimNode; link: ConceptLinkData }[];
  }, [crossLinks, positionMap]);

  const visibleLabels = useMemo(
    () => computeVisibleLabels(simNodes, currentZoom),
    [simNodes, currentZoom],
  );
  const labelOpacity = getLabelOpacity(currentZoom);

  const hasXLink = useCallback((conceptId: number) => {
    return crossLinks.some(l => l.concept_id_a === conceptId || l.concept_id_b === conceptId);
  }, [crossLinks]);

  // --- Gesture handling ---
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      const newScale = Math.max(0.4, Math.min(4, savedScale.value * e.scale));
      scale.value = newScale;
      runOnJS(reheatSim)(newScale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Double-tap to zoom to tier cluster
  const handleDoubleTapTier = useCallback((tier: number) => {
    const tierNodes = simRef.current.filter(n => n.tier === tier);
    if (tierNodes.length === 0) return;

    // Calculate bounding box of tier
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    tierNodes.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });

    const padding = 80;
    const bboxW = maxX - minX + padding * 2;
    const bboxH = maxY - minY + padding * 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const viewW = SCREEN_WIDTH - 32;
    const viewH = 400;
    const targetScale = Math.min(3, viewW / bboxW, viewH / bboxH);

    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    savedScale.value = targetScale;
    translateX.value = withSpring(viewW / 2 - centerX * targetScale, { damping: 20, stiffness: 120 });
    translateY.value = withSpring(viewH / 2 - centerY * targetScale, { damping: 20, stiffness: 120 });
    savedTranslateX.value = viewW / 2 - centerX * targetScale;
    savedTranslateY.value = viewH / 2 - centerY * targetScale;

    reheatSim(targetScale);
  }, [reheatSim, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(e => {
      // Find which tier cluster was tapped
      const tapX = (e.x - translateX.value) / scale.value;
      const tapY = (e.y - translateY.value) / scale.value;

      // Find closest tier center
      let closestTier = 1;
      let closestDist = Infinity;
      for (let t = 1; t <= 5; t++) {
        const dist = Math.abs(tapY - TIER_CENTERS_Y[t]);
        if (dist < closestDist) {
          closestDist = dist;
          closestTier = t;
        }
      }
      runOnJS(handleDoubleTapTier)(closestTier);
    });

  const composed = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // --- Node styling ---
  const getNodeFill = (status: string) => {
    switch (status) {
      case 'mastered': return pillarColor;
      case 'in_progress': return pillarColor + '60';
      case 'not_started': default: return colors.card;
    }
  };

  const getNodeStroke = (status: string) => {
    switch (status) {
      case 'mastered': return pillarColor;
      case 'in_progress': return pillarColor;
      case 'not_started': default: return colors.textTertiary;
    }
  };

  const getNodeOpacity = (concept: ConceptData): number => {
    // Confidence-based opacity: mastered = full, in_progress = 0.85, not_started = 0.55
    switch (concept.status) {
      case 'mastered': return 1.0;
      case 'in_progress': return 0.85;
      case 'not_started': default: return 0.55;
    }
  };

  const getGlowRadius = (concept: ConceptData): number => {
    switch (concept.status) {
      case 'mastered': return NODE_RADIUS + 8;
      case 'in_progress': return NODE_RADIUS + 4;
      case 'not_started': default: return 0;
    }
  };

  // --- Handlers ---
  const handleTap = useCallback((concept: ConceptData) => {
    onConceptTap(concept);
  }, [onConceptTap]);

  const handleLongPress = useCallback((concept: ConceptData) => {
    const cycle: ConceptData['status'][] = ['not_started', 'in_progress', 'mastered'];
    const idx = cycle.indexOf(concept.status);
    const next = cycle[(idx + 1) % cycle.length];
    onStatusChange(concept.id, next);
  }, [onStatusChange]);

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
          <View style={[styles.legendDot, { borderColor: colors.textTertiary, backgroundColor: colors.card }]} />
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
            <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
              <Defs>
                {/* Glow gradients for mastered/in_progress nodes */}
                <RadialGradient id="glowMastered" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={pillarColor} stopOpacity="0.4" />
                  <Stop offset="100%" stopColor={pillarColor} stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="glowInProgress" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={pillarColor} stopOpacity="0.2" />
                  <Stop offset="100%" stopColor={pillarColor} stopOpacity="0" />
                </RadialGradient>
              </Defs>

              {/* Tier zone labels (faded background) */}
              {[1, 2, 3, 4, 5].map(tier => (
                <SvgText
                  key={`tier-label-${tier}`}
                  x={CANVAS_WIDTH / 2}
                  y={TIER_CENTERS_Y[tier] + 60}
                  textAnchor="middle"
                  fill={colors.textTertiary}
                  fontSize={11}
                  fontWeight="600"
                  opacity={0.25}
                >
                  T{tier} — {TIER_NAMES[tier]}
                </SvgText>
              ))}

              {/* Prerequisite edges — curved bezier paths */}
              {prereqEdges.map((edge, i) => {
                const midY = (edge.from.y + edge.to.y) / 2;
                const dx = edge.to.x - edge.from.x;
                const cpOffset = Math.min(Math.abs(dx) * 0.3, 60);
                const path = [
                  `M ${edge.from.x} ${edge.from.y - NODE_RADIUS}`,
                  `C ${edge.from.x + (dx > 0 ? cpOffset : -cpOffset)} ${midY},`,
                  `${edge.to.x - (dx > 0 ? cpOffset : -cpOffset)} ${midY},`,
                  `${edge.to.x} ${edge.to.y + NODE_RADIUS}`,
                ].join(' ');
                return (
                  <Path
                    key={`prereq-${i}`}
                    d={path}
                    stroke={colors.textTertiary}
                    strokeWidth={1.2}
                    fill="none"
                    opacity={0.2}
                  />
                );
              })}

              {/* Cross-pillar link edges — dashed amber with arrow */}
              {crossEdges.map((edge, i) => {
                const dx = edge.to.x - edge.from.x;
                const dy = edge.to.y - edge.from.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) return null;
                const nx = dx / dist;
                const ny = dy / dist;
                // Shorten to node edges
                const x1 = edge.from.x + nx * (NODE_RADIUS + 2);
                const y1 = edge.from.y + ny * (NODE_RADIUS + 2);
                const x2 = edge.to.x - nx * (NODE_RADIUS + 2);
                const y2 = edge.to.y - ny * (NODE_RADIUS + 2);
                // Arrowhead
                const arrowLen = 8;
                const arrowAngle = Math.PI / 6;
                const ax1 = x2 - arrowLen * Math.cos(Math.atan2(dy, dx) - arrowAngle);
                const ay1 = y2 - arrowLen * Math.sin(Math.atan2(dy, dx) - arrowAngle);
                const ax2 = x2 - arrowLen * Math.cos(Math.atan2(dy, dx) + arrowAngle);
                const ay2 = y2 - arrowLen * Math.sin(Math.atan2(dy, dx) + arrowAngle);
                return (
                  <G key={`xlink-${i}`}>
                    <Line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="#F59E0B"
                      strokeWidth={1.5}
                      strokeDasharray="6,4"
                      opacity={0.5}
                    />
                    <Path
                      d={`M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2}`}
                      stroke="#F59E0B"
                      strokeWidth={1.5}
                      fill="none"
                      opacity={0.5}
                    />
                  </G>
                );
              })}

              {/* Nodes */}
              {simNodes.map(node => {
                const isXLinked = hasXLink(node.id);
                const opacity = getNodeOpacity(node.concept);
                const glowR = getGlowRadius(node.concept);
                const showLabel = visibleLabels.has(node.id) && labelOpacity > 0;

                return (
                  <G key={node.id} opacity={opacity}>
                    {/* Glow circle for mastered/in_progress */}
                    {glowR > 0 && (
                      <Circle
                        cx={node.x}
                        cy={node.y}
                        r={glowR}
                        fill={node.concept.status === 'mastered' ? 'url(#glowMastered)' : 'url(#glowInProgress)'}
                      />
                    )}

                    {/* Gold ring for cross-linked concepts */}
                    {isXLinked && (
                      <Circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS + 4}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth={1.5}
                        opacity={0.5}
                      />
                    )}

                    {/* Node circle */}
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={NODE_RADIUS}
                      fill={getNodeFill(node.concept.status)}
                      stroke={getNodeStroke(node.concept.status)}
                      strokeWidth={2}
                      onPress={() => handleTap(node.concept)}
                      onLongPress={() => handleLongPress(node.concept)}
                    />

                    {/* Checkmark for mastered */}
                    {node.concept.status === 'mastered' && (
                      <SvgText
                        x={node.x}
                        y={node.y + 5}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={12}
                        fontWeight="700"
                      >
                        ✓
                      </SvgText>
                    )}

                    {/* Progressive label — only shown when space permits */}
                    {showLabel && (
                      <SvgText
                        x={node.x}
                        y={node.y + NODE_RADIUS + 13}
                        textAnchor="middle"
                        fill={colors.textSecondary}
                        fontSize={10}
                        fontWeight="500"
                        opacity={labelOpacity}
                      >
                        {node.concept.name.length > 18
                          ? node.concept.name.substring(0, 16) + '…'
                          : node.concept.name}
                      </SvgText>
                    )}
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
          Pinch to zoom · Drag to pan · Double-tap tier to focus · Tap node for details · Long-press to cycle status
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
    minHeight: 500,
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
