/**
 * RouteMapScreen — Full-screen interactive map with Strava-style route editing.
 *
 * View mode: Shows discovered route with polyline overlay.
 * Edit mode: Tap map to add waypoints, drag to adjust, live re-routing via GraphHopper.
 */
import React, { useRef, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform,
  Alert, Animated, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Marker } from '../components/MapView';
import {
  DiscoveredRoute, saveDiscoveredRoute, routeThroughWaypoints,
} from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';
import ScreenBackground from '../components/ScreenBackground';
import { Skeleton } from '../components/Skeleton';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: colors.success, moderate: colors.warning, hilly: colors.error,
};

interface Waypoint {
  latitude: number;
  longitude: number;
}

export default function RouteMapScreen({ route: navRoute, navigation }: any) {
  const { route: initialRoute } = navRoute.params as { route: DiscoveredRoute };
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);

  // State
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [routing, setRouting] = useState(false);

  // Route data (can be modified via editing)
  const [routeData, setRouteData] = useState(initialRoute);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [editPolyline, setEditPolyline] = useState<Waypoint[]>([]);

  // Computed from current route
  const coords = useMemo(
    () => routeData.polyline.map(p => ({ latitude: p.lat, longitude: p.lng })),
    [routeData.polyline],
  );

  const region = useMemo(() => {
    const pts = editing && editPolyline.length > 0 ? editPolyline : coords;
    if (pts.length === 0) return undefined;
    const lats = pts.map(p => p.latitude);
    const lngs = pts.map(p => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) + 0.005,
      longitudeDelta: (maxLng - minLng) + 0.005,
    };
  }, [coords, editPolyline, editing]);

  const start = coords[0];
  const diffColor = DIFFICULTY_COLORS[routeData.difficulty] || colors.textTertiary;
  const displayCoords = editing && editPolyline.length > 0 ? editPolyline : coords;

  // --- Editing ---

  const reroute = useCallback(async (wps: Waypoint[]) => {
    if (wps.length < 2) {
      setEditPolyline([]);
      return;
    }
    setRouting(true);
    try {
      const result = await routeThroughWaypoints(
        wps.map(w => ({ lat: w.latitude, lng: w.longitude }))
      );
      setEditPolyline(
        result.polyline.map((p: any) => ({ latitude: p.lat, longitude: p.lng }))
      );
      // Update route stats
      setRouteData(prev => ({
        ...prev,
        distance_miles: result.distance_miles,
        elevation_gain_ft: result.elevation_gain_ft,
        estimated_time_minutes: result.estimated_time_minutes,
        street_names: result.street_names,
        difficulty: result.difficulty,
        polyline: result.polyline,
      }));
    } catch (err) {
      console.warn('Reroute failed:', err);
    }
    setRouting(false);
  }, []);

  const handleMapPress = useCallback((e: any) => {
    if (!editing) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    haptic.light();
    const newWps = [...waypoints, { latitude, longitude }];
    setWaypoints(newWps);
    reroute(newWps);
  }, [editing, waypoints, reroute]);

  const handleWaypointDrag = useCallback((idx: number, e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const newWps = [...waypoints];
    newWps[idx] = { latitude, longitude };
    setWaypoints(newWps);
    reroute(newWps);
  }, [waypoints, reroute]);

  const removeWaypoint = useCallback((idx: number) => {
    haptic.light();
    const newWps = waypoints.filter((_, i) => i !== idx);
    setWaypoints(newWps);
    if (newWps.length < 2) {
      setEditPolyline([]);
      // Reset to original route
      setRouteData(initialRoute);
    } else {
      reroute(newWps);
    }
  }, [waypoints, reroute, initialRoute]);

  const startEditing = () => {
    setEditing(true);
    haptic.light();
    // Seed waypoints from start/end of current route
    if (coords.length > 0) {
      const start = coords[0];
      const end = coords[coords.length - 1];
      const wps = [start, end];
      setWaypoints(wps);
      // Don't reroute yet — user will add intermediate points
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    setWaypoints([]);
    setEditPolyline([]);
    setRouteData(initialRoute);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDiscoveredRoute(routeData);
      haptic.success();
      setSaved(true);
    } catch { haptic.error(); }
    setSaving(false);
  };

  // Bottom sheet swipe
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetCollapsed = useRef(false);
  const SHEET_FULL_HEIGHT = 340;
  const SHEET_COLLAPSED_HEIGHT = 80;
  const COLLAPSE_OFFSET = SHEET_FULL_HEIGHT - SHEET_COLLAPSED_HEIGHT;

  const sheetPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
    onPanResponderMove: (_, g) => {
      const current = sheetCollapsed.current ? COLLAPSE_OFFSET : 0;
      const newVal = Math.max(0, Math.min(COLLAPSE_OFFSET, current + g.dy));
      sheetTranslateY.setValue(newVal);
    },
    onPanResponderRelease: (_, g) => {
      const current = sheetCollapsed.current ? COLLAPSE_OFFSET : 0;
      const dest = g.dy > 50 ? COLLAPSE_OFFSET : g.dy < -50 ? 0 : current;
      sheetCollapsed.current = dest === COLLAPSE_OFFSET;
      Animated.spring(sheetTranslateY, {
        toValue: dest, useNativeDriver: true, bounciness: 4, speed: 14,
      }).start();
    },
  }), []);

  const handleRecenter = () => {
    if (displayCoords.length > 1) {
      mapRef.current?.fitToCoordinates(displayCoords, {
        edgePadding: { top: 100, right: 60, bottom: 320, left: 60 },
        animated: true,
      });
    }
  };

  return (
    <ScreenBackground>
    <View style={s.container}>
      {/* Map */}
      {Platform.OS !== 'web' && region && (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton={false}
          onPress={handleMapPress}
          onMapReady={() => {
            if (displayCoords.length > 1) {
              mapRef.current?.fitToCoordinates(displayCoords, {
                edgePadding: { top: 100, right: 60, bottom: 320, left: 60 },
                animated: false,
              });
            }
          }}
        >
          {/* Route polyline */}
          {displayCoords.length > 1 && (
            <Polyline
              coordinates={displayCoords}
              strokeColor={colors.accent}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {/* Start marker (view mode) */}
          {!editing && start && (
            <Marker coordinate={start} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={s.startMarker}>
                <Ionicons name="play" size={10} color="#fff" />
              </View>
            </Marker>
          )}

          {/* Waypoint markers (edit mode) */}
          {editing && waypoints.map((wp, idx) => (
            <Marker
              key={`wp-${idx}`}
              coordinate={wp}
              draggable
              onDragEnd={(e: any) => handleWaypointDrag(idx, e)}
              onCalloutPress={() => removeWaypoint(idx)}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[s.waypointMarker, idx === 0 && s.waypointStart, idx === waypoints.length - 1 && s.waypointEnd]}>
                <Text style={s.waypointLabel}>
                  {idx === 0 ? 'A' : idx === waypoints.length - 1 ? String.fromCharCode(65 + idx) : String.fromCharCode(65 + idx)}
                </Text>
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {/* Top bar — edit mode controls */}
      {editing && (
        <View style={[s.editBar, { top: insets.top + 50 }]}>
          <TouchableOpacity style={s.editBarBtn} onPress={cancelEditing}>
            <Ionicons name="close" size={18} color={colors.error} />
            <Text style={[s.editBarText, { color: colors.error }]}>Cancel</Text>
          </TouchableOpacity>

          <View style={s.editBarCenter}>
            {routing ? (
              <Skeleton width={100} height={14} />
            ) : (
              <Text style={s.editBarHint}>
                Tap map to add waypoints · Drag to adjust
              </Text>
            )}
          </View>

          {waypoints.length > 2 && (
            <TouchableOpacity style={s.editBarBtn} onPress={() => {
              const newWps = waypoints.slice(0, -1);
              setWaypoints(newWps);
              reroute(newWps);
            }}>
              <Ionicons name="arrow-undo" size={18} color={colors.accent} />
              <Text style={[s.editBarText, { color: colors.accent }]}>Undo</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Recenter */}
      <TouchableOpacity
        style={[s.recenterBtn, { top: editing ? insets.top + 100 : insets.top + 56 }]}
        onPress={handleRecenter}
      >
        <Ionicons name="locate-outline" size={20} color={colors.text} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <Animated.View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md), transform: [{ translateY: sheetTranslateY }] }]}>
        <View {...sheetPanResponder.panHandlers}>
          <View style={s.handle} />
        </View>

        <Text style={s.routeName}>{routeData.name || 'Custom Route'}</Text>
        {routeData.description ? (
          <Text style={s.routeDesc} numberOfLines={2}>{routeData.description}</Text>
        ) : null}

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{routeData.distance_miles.toFixed(1)}</Text>
            <Text style={s.statLabel}>mi</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>{routeData.elevation_gain_ft}</Text>
            <Text style={s.statLabel}>ft gain</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>{routeData.estimated_time_minutes}</Text>
            <Text style={s.statLabel}>min</Text>
          </View>
          <View style={s.statDivider} />
          <View style={[s.diffBadge, { backgroundColor: (DIFFICULTY_COLORS[routeData.difficulty] || colors.textTertiary) + '20' }]}>
            <Text style={[s.diffText, { color: DIFFICULTY_COLORS[routeData.difficulty] || colors.textTertiary }]}>
              {routeData.difficulty}
            </Text>
          </View>
        </View>

        {/* Street names */}
        {routeData.street_names && routeData.street_names.length > 0 && (
          <View style={s.streetsSection}>
            <Text style={s.streetsLabel}>ROUTE</Text>
            <Text style={s.streetsText}>{routeData.street_names.join(' → ')}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={s.actions}>
          {!editing ? (
            <>
              <TouchableOpacity
                style={s.editBtn}
                onPress={startEditing}
              >
                <Ionicons name="create-outline" size={18} color={colors.accent} />
                <Text style={s.editBtnText}>Edit Route</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.saveBtn, saved && s.saveBtnDone]}
                onPress={handleSave}
                disabled={saved || saving}
              >
                <Ionicons
                  name={saved ? 'checkmark-circle' : 'bookmark-outline'}
                  size={18}
                  color={saved ? colors.success : colors.text}
                />
                <Text style={[s.saveBtnText, saved && { color: colors.success }]}>
                  {saved ? 'Saved' : 'Save'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.startRunBtn}
                onPress={() => {
                  haptic.light();
                  navigation?.navigate?.('RunGPS', { route: routeData });
                }}
              >
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={s.startRunText}>Run</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={s.editBtn} onPress={cancelEditing}>
                <Text style={s.editBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.startRunBtn}
                onPress={() => {
                  setEditing(false);
                  haptic.success();
                }}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={s.startRunText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>
    </View>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  recenterBtn: {
    position: 'absolute', right: spacing.lg,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },

  // Edit bar
  editBar: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card + 'EE', borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  editBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBarText: { ...typography.caption, fontWeight: '600' },
  editBarCenter: { flex: 1, alignItems: 'center' },
  editBarHint: { ...typography.micro, color: colors.textTertiary, textAlign: 'center' },

  // Bottom sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
    borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.textTertiary + '40',
    alignSelf: 'center', marginBottom: spacing.md,
  },

  routeName: { ...typography.title2, color: colors.text, marginBottom: 4 },
  routeDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.title3, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: colors.border },
  diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  diffText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' as const },

  streetsSection: { paddingVertical: spacing.md },
  streetsLabel: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase' as const, marginBottom: 4 },
  streetsText: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },

  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border,
  },
  editBtnText: { ...typography.bodyBold, color: colors.accent },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border,
  },
  saveBtnDone: { backgroundColor: colors.success + '15', borderColor: colors.success + '30' },
  saveBtnText: { ...typography.bodyBold, color: colors.text },
  startRunBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  startRunText: { ...typography.bodyBold, color: '#fff' },

  startMarker: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.success, borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  waypointMarker: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  waypointStart: { backgroundColor: colors.success },
  waypointEnd: { backgroundColor: '#FF5252' },
  waypointLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
