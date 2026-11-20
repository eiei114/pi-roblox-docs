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

test("assessCacheFreshness reports stale when a complete cache has no last sync timestamp", () => {
  const freshness = assessCacheFreshness({ hasApiDump: true, hasApiDocs: true }, now);
  assert.equal(freshness.state, "stale");
  assert.equal(freshness.lastSync, null);
  assert.equal(freshness.ageMs, null);
  assert.equal(freshness.ageLabel, "unknown");
  assert.equal(freshness.staleThresholdMs, CACHE_STALE_THRESHOLD_MS);
  assert.equal(freshness.staleThresholdDays, 7);
  assert.deepEqual(formatCacheFreshnessLines(freshness), [
    "Cache freshness: stale (last sync unknown)",
    "Recommendation: run roblox_sync to refresh local API docs.",
  ]);
});

test("assessCacheFreshness reports stale when a complete cache has an invalid last sync timestamp", () => {
  const lastSync = "not-a-timestamp";
  const freshness = assessCacheFreshness({ lastSync, hasApiDump: true, hasApiDocs: true }, now);
  assert.equal(freshness.state, "stale");
  assert.equal(freshness.lastSync, lastSync);
  assert.equal(freshness.ageMs, null);
  assert.equal(freshness.ageLabel, "unknown");
  assert.equal(freshness.staleThresholdMs, CACHE_STALE_THRESHOLD_MS);
  assert.equal(freshness.staleThresholdDays, 7);
  assert.deepEqual(formatCacheFreshnessLines(freshness), [
    "Cache freshness: stale (last sync unknown)",
    "Recommendation: run roblox_sync to refresh local API docs.",
  ]);
});

test("assessCacheFreshness reports never_synced for a partial cache despite its last sync timestamp", () => {
  const lastSync = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const freshness = assessCacheFreshness({ lastSync, hasApiDump: true, hasApiDocs: false }, now);
  assert.equal(freshness.state, "never_synced");
  assert.equal(freshness.lastSync, lastSync);
  assert.equal(freshness.ageMs, null);
  assert.equal(freshness.ageLabel, "never");
  assert.equal(freshness.staleThresholdMs, CACHE_STALE_THRESHOLD_MS);
  assert.equal(freshness.staleThresholdDays, 7);
  assert.deepEqual(formatCacheFreshnessLines(freshness), [
    "Cache freshness: not synced",
    "Recommendation: run roblox_sync before searching.",
  ]);
});

test("assessCacheFreshness clamps a future last sync timestamp to zero age", () => {
  const lastSync = new Date(now + 60 * 60 * 1000).toISOString();
  const freshness = assessCacheFreshness({ lastSync, hasApiDump: true, hasApiDocs: true }, now);
  assert.equal(freshness.state, "fresh");
  assert.equal(freshness.lastSync, lastSync);
  assert.equal(freshness.ageMs, 0);
  assert.equal(freshness.ageLabel, "0 seconds ago");
  assert.equal(formatSyncAge(lastSync, now), "0 seconds ago");
  assert.equal(freshness.staleThresholdMs, CACHE_STALE_THRESHOLD_MS);
  assert.equal(freshness.staleThresholdDays, 7);
  assert.deepEqual(formatCacheFreshnessLines(freshness), [
    "Cache freshness: fresh (synced 0 seconds ago)",
  ]);
});
