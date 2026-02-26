/**
 * PacePolyline — P4-022
 *
 * Renders a GPS route as colored polyline segments based on pace.
 * Green = on/faster than target, Yellow = slightly slow, Red = too slow.
 * Falls back to single-color polyline if no target pace is set.
 */

import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { Polyline } from './MapView';
import { GpsPoint } from '../services/gps';

interface PacePolylineProps {
  points: GpsPoint[];
  targetPaceSeconds: number | null;
  /** If true, use a single accent color (no pace coloring) */
  singleColor?: string;
  strokeWidth?: number;
}

interface PaceSegment {
  coordinates: Array<{ latitude: number; longitude: number }>;
  color: string;
}

// Colors: fastest → slowest
const PACE_FAST = '#10B981';    // green — faster than target
const PACE_ON_TARGET = '#3B82F6'; // blue — within ±10s of target
const PACE_SLOW = '#F59E0B';    // yellow — 10-25s slower
const PACE_VERY_SLOW = '#EF4444'; // red — 25s+ slower

const METERS_TO_MILES = 0.000621371;

function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate pace color based on deviation from target.
 */
function getPaceColor(paceSeconds: number, targetPaceSeconds: number): string {
  const diff = paceSeconds - targetPaceSeconds;
  if (diff <= -5) return PACE_FAST;       // faster than target
  if (diff <= 10) return PACE_ON_TARGET;   // on target (within 10s slow)
  if (diff <= 25) return PACE_SLOW;        // getting slow
  return PACE_VERY_SLOW;                   // too slow
}

/**
 * Segment GPS points into pace-colored chunks.
 * Uses a sliding window of ~5 points to smooth pace calculation.
 */
function buildPaceSegments(
  points: GpsPoint[],
  targetPaceSeconds: number,
): PaceSegment[] {
  if (points.length < 2) return [];

  const WINDOW = 5; // smoothing window
  const segments: PaceSegment[] = [];
  let currentColor = PACE_ON_TARGET;
  let currentCoords: Array<{ latitude: number; longitude: number }> = [
    { latitude: points[0].latitude, longitude: points[0].longitude },
  ];

  for (let i = 1; i < points.length; i++) {
    const coord = { latitude: points[i].latitude, longitude: points[i].longitude };

    // Calculate smoothed pace using window
    const windowStart = Math.max(0, i - WINDOW);
    const windowEnd = i;
    const distM = haversineMeters(
      points[windowStart].latitude, points[windowStart].longitude,
      points[windowEnd].latitude, points[windowEnd].longitude,
    );
    const timeSec = (points[windowEnd].timestamp - points[windowStart].timestamp) / 1000;

    let color = PACE_ON_TARGET;
    if (distM > 5 && timeSec > 0) {
      const distMiles = distM * METERS_TO_MILES;
      const paceSeconds = Math.round(timeSec / distMiles);
      // Clamp unreasonable values
      if (paceSeconds > 60 && paceSeconds < 1800) {
        color = getPaceColor(paceSeconds, targetPaceSeconds);
      }
    }

    if (color !== currentColor && currentCoords.length > 0) {
      // Finish current segment (overlap by one point for continuity)
      segments.push({ coordinates: [...currentCoords], color: currentColor });
      currentCoords = [currentCoords[currentCoords.length - 1]];
      currentColor = color;
    }
    currentCoords.push(coord);
  }

  // Push final segment
  if (currentCoords.length >= 2) {
    segments.push({ coordinates: currentCoords, color: currentColor });
  }

  return segments;
}

export default function PacePolyline({
  points,
  targetPaceSeconds,
  singleColor,
  strokeWidth = 4,
}: PacePolylineProps) {
  if (Platform.OS === 'web' || points.length < 2) return null;

  const segments = useMemo(() => {
    if (singleColor || !targetPaceSeconds) {
      // Single color fallback
      return [{
        coordinates: points.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
        color: singleColor || '#6366F1',
      }];
    }
    return buildPaceSegments(points, targetPaceSeconds);
  }, [points.length, targetPaceSeconds, singleColor]);

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={`pace-${i}-${seg.color}`}
          coordinates={seg.coordinates}
          strokeColor={seg.color}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      ))}
    </>
  );
}

export { PACE_FAST, PACE_ON_TARGET, PACE_SLOW, PACE_VERY_SLOW, getPaceColor };
