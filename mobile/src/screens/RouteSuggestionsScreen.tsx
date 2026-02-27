/**
 * RouteSuggestionsScreen — AI-powered running route discovery.
 *
 * Uses current GPS location to generate route suggestions via Clawdbot.
 * Shows route cards with mini map previews, difficulty badges, and save/run actions.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';
import {
  discoverRoutes, saveDiscoveredRoute,
  DiscoveredRoute, RouteDiscoveryResult,
} from '../api/client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#10B981',
  moderate: '#F59E0B',
  challenging: '#EF4444',
};

const TERRAIN_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  road: 'car-outline',
  trail: 'leaf-outline',
  mixed: 'git-merge-outline',
  track: 'ellipse-outline',
};

const DISTANCE_FILTERS = [
  { label: '1-3 mi', min: 1, max: 3, target: 2 },
  { label: '3-5 mi', min: 3, max: 5, target: 4 },
  { label: '5-8 mi', min: 5, max: 8, target: 6.5 },
  { label: '8+ mi', min: 8, max: 15, target: 10 },
];

const TERRAIN_FILTERS = ['flat', 'hilly', 'scenic', 'shaded'];

const FUN_MESSAGES = [
  'Finding routes near you...',
  'Mapping the neighborhood...',
  'Scouting the best paths...',
  'Checking elevation data...',
  'Almost there...',
];

export default function RouteSuggestionsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [result, setResult] = useState<RouteDiscoveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(FUN_MESSAGES[0]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Filters
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null); // index
  const [terrainPrefs, setTerrainPrefs] = useState<string[]>([]);

  // Cycle through fun loading messages
  useEffect(() => {
    if (!loading) return;
    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % FUN_MESSAGES.length;
      setLoadingMsg(FUN_MESSAGES[idx]);
    }, 3000);
    return () => clearInterval(timer);
  }, [loading]);

  const fetchLocation = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location services to discover routes nearby.');
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setLocation(coords);
      return coords;
    } catch (err) {
      console.warn('Location error:', err);
      Alert.alert('Location Error', 'Could not get your current location.');
      return null;
    }
  }, []);

  const discover = useCallback(async (coords?: { lat: number; lng: number } | null) => {
    const loc = coords || location;
    if (!loc) {
      const fetched = await fetchLocation();
      if (!fetched) { setLoading(false); return; }
      return discover(fetched);
    }

    setLoading(true);
    try {
      const target = distanceFilter !== null ? DISTANCE_FILTERS[distanceFilter].target : undefined;
      const prefs = terrainPrefs.length > 0 ? terrainPrefs : undefined;
      const data = await discoverRoutes(loc.lat, loc.lng, target, prefs);
      setResult(data);
    } catch (err) {
      console.warn('Route discovery error:', err);
      setResult({ routes: [], area_name: 'Unknown', tips: 'Failed to discover routes. Try again.', error: String(err) });
    }
    setLoading(false);
  }, [location, distanceFilter, terrainPrefs, fetchLocation]);

  useEffect(() => {
    (async () => {
      const coords = await fetchLocation();
      if (coords) await discover(coords);
      else setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await discover();
    setRefreshing(false);
  }, [discover]);

  const handleSave = async (route: DiscoveredRoute) => {
    haptic.light();
    setSavingId(route.name);
    try {
      await saveDiscoveredRoute(route);
      Alert.alert('Saved!', `${route.name} added to your Route Library.`);
    } catch (err) {
      console.warn('Save failed:', err);
      Alert.alert('Error', 'Failed to save route.');
    }
    setSavingId(null);
  };

  const handleRunThis = (route: DiscoveredRoute) => {
    haptic.medium();
    // Navigate to RunScreen with route context
    navigation?.navigate?.('RunGPS', {
      routeName: route.name,
      targetMiles: route.distance_miles,
      waypoints: route.waypoints,
    });
  };

  const renderRouteCard = (route: DiscoveredRoute, index: number) => {
    const diffColor = DIFFICULTY_COLORS[route.difficulty] || colors.textSecondary;
    const terrainIcon = TERRAIN_ICONS[route.terrain] || 'map-outline';
    const hasWaypoints = route.waypoints && route.waypoints.length >= 2;

    // Calculate map region from waypoints
    let mapRegion = null;
    if (hasWaypoints) {
      const lats = route.waypoints.map(w => w.lat);
      const lngs = route.waypoints.map(w => w.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      mapRegion = {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: (maxLat - minLat) * 1.5 + 0.005,
        longitudeDelta: (maxLng - minLng) * 1.5 + 0.005,
      };
    }

    return (
      <View key={index} style={styles.routeCard}>
        {/* Mini Map */}
        {hasWaypoints && mapRegion && (
          <View style={styles.miniMapContainer}>
            <MapView
              style={styles.miniMap}
              region={mapRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              showsUserLocation={false}
              liteMode
            >
              <Polyline
                coordinates={route.waypoints.map(w => ({ latitude: w.lat, longitude: w.lng }))}
                strokeColor={colors.accent}
                strokeWidth={3}
              />
              {/* Start marker */}
              <Marker
                coordinate={{ latitude: route.waypoints[0].lat, longitude: route.waypoints[0].lng }}
                pinColor="#10B981"
              />
              {/* End marker */}
              <Marker
                coordinate={{
                  latitude: route.waypoints[route.waypoints.length - 1].lat,
                  longitude: route.waypoints[route.waypoints.length - 1].lng,
                }}
                pinColor="#EF4444"
              />
            </MapView>
          </View>
        )}

        {/* Route Info */}
        <View style={styles.routeInfo}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeName} numberOfLines={1}>{route.name}</Text>
            <View style={[styles.diffBadge, { backgroundColor: diffColor + '20' }]}>
              <Text style={[styles.diffText, { color: diffColor }]}>
                {route.difficulty.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.routeDesc} numberOfLines={2}>{route.description}</Text>

          {/* Stats row */}
          <View style={styles.routeStats}>
            <View style={styles.routeStat}>
              <Ionicons name="resize-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.routeStatText}>{route.distance_miles.toFixed(1)} mi</Text>
            </View>
            <View style={styles.routeStat}>
              <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.routeStatText}>~{route.estimated_minutes} min</Text>
            </View>
            <View style={styles.routeStat}>
              <Ionicons name="trending-up-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.routeStatText}>{route.elevation_gain_ft} ft</Text>
            </View>
            <View style={styles.routeStat}>
              <Ionicons name={terrainIcon} size={14} color={colors.textTertiary} />
              <Text style={styles.routeStatText}>{route.terrain}</Text>
            </View>
          </View>

          {/* Tags */}
          {route.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {route.tags.slice(0, 4).map(tag => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.routeActions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => handleSave(route)}
              disabled={savingId === route.name}
            >
              {savingId === route.name ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <Ionicons name="bookmark-outline" size={16} color={colors.accent} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.runBtn}
              onPress={() => handleRunThis(route)}
            >
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.runBtnText}>Run This</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Discover Routes</Text>
      </View>

      {/* Area name */}
      {result?.area_name && !loading && (
        <View style={styles.areaRow}>
          <Ionicons name="location" size={16} color={colors.accent} />
          <Text style={styles.areaName}>{result.area_name}</Text>
        </View>
      )}

      {/* Distance filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {DISTANCE_FILTERS.map((df, idx) => {
          const active = distanceFilter === idx;
          return (
            <TouchableOpacity
              key={df.label}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => {
                haptic.selection();
                setDistanceFilter(active ? null : idx);
              }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{df.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Terrain preference pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {TERRAIN_FILTERS.map(tf => {
          const active = terrainPrefs.includes(tf);
          return (
            <TouchableOpacity
              key={tf}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => {
                haptic.selection();
                setTerrainPrefs(prev =>
                  active ? prev.filter(x => x !== tf) : [...prev, tf]
                );
              }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {tf.charAt(0).toUpperCase() + tf.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* Re-discover button */}
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}
          onPress={() => discover()}
        >
          <Ionicons name="refresh" size={14} color={colors.accent} />
          <Text style={[styles.filterText, { color: colors.accent, marginLeft: 4 }]}>Refresh</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Loading state */}
      {loading && (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>{loadingMsg}</Text>
        </View>
      )}

      {/* Results */}
      {!loading && result && result.routes.length > 0 && (
        <>
          {result.routes.map((route, idx) => renderRouteCard(route, idx))}

          {result.tips && (
            <View style={styles.tipsCard}>
              <Ionicons name="bulb-outline" size={16} color={colors.warning} />
              <Text style={styles.tipsText}>{result.tips}</Text>
            </View>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && result && result.routes.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="compass-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No routes found</Text>
          <Text style={styles.emptySubtext}>
            {result.error ? 'Route discovery service is unavailable.' : 'Try different distance or terrain filters.'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => discover()}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* No location */}
      {!loading && !location && (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>Location needed</Text>
          <Text style={styles.emptySubtext}>Enable location services to discover routes near you.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => discover()}>
            <Text style={styles.retryText}>Enable & Discover</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  backBtn: { marginRight: spacing.md },
  title: { ...typography.title1, color: colors.text },

  areaRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  areaName: { ...typography.body, color: colors.textSecondary },

  filterScroll: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm, maxHeight: 40 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm,
    backgroundColor: colors.card,
  },
  filterChipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  filterText: { ...typography.caption, color: colors.textSecondary },
  filterTextActive: { color: colors.accent },

  loadingState: { alignItems: 'center', paddingTop: 80, gap: spacing.lg },
  loadingText: { ...typography.body, color: colors.textSecondary },

  // Route cards
  routeCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  miniMapContainer: { height: 150, overflow: 'hidden' },
  miniMap: { flex: 1 },
  routeInfo: { padding: spacing.lg },
  routeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  routeName: { ...typography.title3, color: colors.text, flex: 1, marginRight: spacing.sm },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  diffText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  routeDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },

  routeStats: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm, flexWrap: 'wrap' },
  routeStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  routeStatText: { ...typography.micro, color: colors.textTertiary },

  tagsRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap' },
  tagChip: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: colors.input,
  },
  tagText: { ...typography.micro, color: colors.textSecondary, fontSize: 10 },

  routeActions: { flexDirection: 'row', gap: spacing.md },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.accent, gap: 6,
  },
  saveBtnText: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  runBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 2, borderRadius: radius.md,
    backgroundColor: colors.accent, gap: 6,
  },
  runBtnText: { ...typography.bodyBold, color: '#fff', fontSize: 14 },

  // Tips
  tipsCard: {
    flexDirection: 'row', gap: spacing.sm,
    marginHorizontal: spacing.lg, padding: spacing.md,
    backgroundColor: colors.cardElevated, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  tipsText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyText: { ...typography.title3, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryBtn: {
    marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: radius.md, backgroundColor: colors.accentMuted,
  },
  retryText: { ...typography.bodyBold, color: colors.accent },
});
