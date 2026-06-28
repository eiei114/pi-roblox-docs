import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  clearRobloxCache,
  formatClearCacheMessage,
  inspectCacheHealth,
} from "../extensions/roblox-docs.ts";

let originalCacheDir;
let testCacheDir;

test.beforeEach(() => {
  originalCacheDir = process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  testCacheDir = join(tmpdir(), `pi-roblox-docs-clear-cache-${process.pid}-${Math.random().toString(36).slice(2)}`);
  process.env.PI_ROBLOX_DOCS_CACHE_DIR = testCacheDir;
});

test.afterEach(async () => {
  if (testCacheDir) {
    await rm(testCacheDir, { recursive: true, force: true });
  }
  if (originalCacheDir === undefined) {
    delete process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  } else {
    process.env.PI_ROBLOX_DOCS_CACHE_DIR = originalCacheDir;
  }
});

async function seedSyncedCache() {
  await mkdir(testCacheDir, { recursive: true });
  await writeFile(join(testCacheDir, "api-dump.json"), JSON.stringify({ Version: 1, Classes: [], Enums: [] }), "utf8");
  await writeFile(join(testCacheDir, "api-docs-en-us.json"), "{}", "utf8");
  await writeFile(
    join(testCacheDir, "metadata.json"),
    JSON.stringify({ version: "test", language: "en-us", lastSync: new Date().toISOString() }),
    "utf8",
  );
  await writeFile(join(testCacheDir, "devforum-cache.json"), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), entries: {} }), "utf8");
}

test("clearRobloxCache on empty cache reports no deletion and reminds user to sync", async () => {
  const result = await clearRobloxCache();
  assert.equal(result.existed, false);
  assert.equal(result.cacheDir, testCacheDir);

  const message = formatClearCacheMessage(result);
  assert.match(message, /already empty/);
  assert.match(message, /roblox_sync/);
  assert.match(message, /roblox_search/);
});

test("clearRobloxCache after sync deletes package-owned cache and health reports empty state", async () => {
  await seedSyncedCache();

  const before = await inspectCacheHealth();
  assert.equal(before.hasApiDump, true);
  assert.equal(before.hasApiDocs, true);
  assert.equal(before.indexed, true);

  const result = await clearRobloxCache();
  assert.equal(result.existed, true);
  assert.equal(result.cacheDir, testCacheDir);

  const message = formatClearCacheMessage(result);
  assert.match(message, /cache cleared/);
  assert.match(message, /roblox_sync/);

  const after = await inspectCacheHealth();
  assert.equal(after.hasApiDump, false);
  assert.equal(after.hasApiDocs, false);
  assert.equal(after.indexed, false);
  assert.equal(after.cacheDir, testCacheDir);
});
