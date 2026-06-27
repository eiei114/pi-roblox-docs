import assert from "node:assert/strict";
import test from "node:test";
import {
  CACHE_STALE_THRESHOLD_MS,
  assessCacheFreshness,
  formatCacheFreshnessLines,
  formatSyncAge,
} from "../extensions/cache-freshness.ts";

const now = Date.parse("2026-06-28T12:00:00.000Z");

test("assessCacheFreshness reports never_synced when cache files are missing", () => {
  const freshness = assessCacheFreshness({ hasApiDump: false, hasApiDocs: false }, now);
  assert.equal(freshness.state, "never_synced");
  assert.deepEqual(formatCacheFreshnessLines(freshness), [
    "Cache freshness: not synced",
    "Recommendation: run roblox_sync before searching.",
  ]);
});

test("assessCacheFreshness reports fresh when last sync is within the threshold", () => {
  const lastSync = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const freshness = assessCacheFreshness({ lastSync, hasApiDump: true, hasApiDocs: true }, now);
  assert.equal(freshness.state, "fresh");
  assert.equal(formatSyncAge(lastSync, now), "2 hours ago");
  assert.deepEqual(formatCacheFreshnessLines(freshness), ["Cache freshness: fresh (synced 2 hours ago)"]);
});

test("assessCacheFreshness reports stale when last sync exceeds the threshold", () => {
  const lastSync = new Date(now - CACHE_STALE_THRESHOLD_MS - 24 * 60 * 60 * 1000).toISOString();
  const freshness = assessCacheFreshness({ lastSync, hasApiDump: true, hasApiDocs: true }, now);
  assert.equal(freshness.state, "stale");
  assert.deepEqual(formatCacheFreshnessLines(freshness), [
    "Cache freshness: stale (last sync 8 days ago)",
    "Recommendation: run roblox_sync to refresh local API docs.",
  ]);
});
