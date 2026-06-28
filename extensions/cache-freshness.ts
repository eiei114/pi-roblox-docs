/** Time-based stale threshold for local Roblox API docs cache (see README Cache section). */
export const CACHE_STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheFreshnessState = "fresh" | "stale" | "never_synced";

export interface CacheFreshnessInfo {
  state: CacheFreshnessState;
  lastSync: string | null;
  ageMs: number | null;
  ageLabel: string;
  staleThresholdMs: number;
  staleThresholdDays: number;
}

export function formatDuration(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatSyncAge(lastSync: string | undefined | null, nowMs = Date.now()): string {
  if (!lastSync) return "never";
  const parsed = Date.parse(lastSync);
  if (Number.isNaN(parsed)) return "unknown";
  return formatDuration(Math.max(0, nowMs - parsed));
}

export function assessCacheFreshness(
  options: { lastSync?: string; hasApiDump: boolean; hasApiDocs: boolean },
  nowMs = Date.now(),
): CacheFreshnessInfo {
  const staleThresholdMs = CACHE_STALE_THRESHOLD_MS;
  const staleThresholdDays = staleThresholdMs / (24 * 60 * 60 * 1000);
  const hasCache = options.hasApiDump && options.hasApiDocs;
  const lastSync = options.lastSync ?? null;

  if (!hasCache) {
    return {
      state: "never_synced",
      lastSync,
      ageMs: null,
      ageLabel: "never",
      staleThresholdMs,
      staleThresholdDays,
    };
  }

  if (!lastSync) {
    return {
      state: "stale",
      lastSync: null,
      ageMs: null,
      ageLabel: "unknown",
      staleThresholdMs,
      staleThresholdDays,
    };
  }

  const parsed = Date.parse(lastSync);
  if (Number.isNaN(parsed)) {
    return {
      state: "stale",
      lastSync,
      ageMs: null,
      ageLabel: "unknown",
      staleThresholdMs,
      staleThresholdDays,
    };
  }

  const ageMs = Math.max(0, nowMs - parsed);
  const state: CacheFreshnessState = ageMs > staleThresholdMs ? "stale" : "fresh";
  return {
    state,
    lastSync,
    ageMs,
    ageLabel: formatSyncAge(lastSync, nowMs),
    staleThresholdMs,
    staleThresholdDays,
  };
}

export function formatCacheFreshnessLines(freshness: CacheFreshnessInfo): string[] {
  if (freshness.state === "never_synced") {
    return ["Cache freshness: not synced", "Recommendation: run roblox_sync before searching."];
  }

  if (freshness.state === "stale") {
    return [
      `Cache freshness: stale (last sync ${freshness.ageLabel})`,
      "Recommendation: run roblox_sync to refresh local API docs.",
    ];
  }

  return [`Cache freshness: fresh (synced ${freshness.ageLabel})`];
}
