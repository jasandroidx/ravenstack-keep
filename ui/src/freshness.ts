/** Honest age. Never bump updated_at just to make the map look alive. */

export const DEFAULT_POLL_SEC = 3;

export function ageSec(iso?: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 1000);
}

export function formatAge(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

/** Stale when older than 3× poll, or when the timestamp is missing. */
export function isStale(
  iso: string | undefined | null,
  pollSec: number,
  now = Date.now(),
): boolean {
  const a = ageSec(iso, now);
  if (a == null) return true;
  return a > 3 * Math.max(1, pollSec);
}

export function ageLabel(iso?: string | null, now = Date.now()): string | null {
  const a = ageSec(iso, now);
  if (a == null) return null;
  return formatAge(a);
}
