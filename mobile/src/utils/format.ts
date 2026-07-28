/**
 * Shared run/time formatting helpers.
 * (Previously lived in the now-removed GPS tracking service.)
 */

/** Format a per-mile pace (seconds) as M:SS, or "--:--" when missing/implausible. */
export function formatPace(seconds: number | null): string {
  if (!seconds || seconds <= 0 || seconds > 3600) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
