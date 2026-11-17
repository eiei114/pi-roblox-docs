import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncRobloxData } from "../extensions/roblox-docs.ts";

let originalCacheDir;
let originalFetch;
let testCacheDir;

test.beforeEach(() => {
  originalCacheDir = process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  originalFetch = globalThis.fetch;
  testCacheDir = join(tmpdir(), `pi-roblox-docs-sync-offline-${process.pid}-${Math.random().toString(36).slice(2)}`);
  process.env.PI_ROBLOX_DOCS_CACHE_DIR = testCacheDir;
  globalThis.fetch = async () => {
    throw new Error("network is unreachable");
  };
});

test.afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (testCacheDir) {
    await rm(testCacheDir, { recursive: true, force: true });
  }
  if (originalCacheDir === undefined) {
    delete process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  } else {
    process.env.PI_ROBLOX_DOCS_CACHE_DIR = originalCacheDir;
  }
});

const META = {
  version: "cached-version",
  apiDumpVersion: 1,
  language: "en-us",
  lastSync: "2026-11-01T00:00:00.000Z",
  sources: ["api_dump", "api_docs", "version"],
};

async function seedSyncedCache() {
  await mkdir(testCacheDir, { recursive: true });
  await writeFile(join(testCacheDir, "api-dump.json"), JSON.stringify({ Version: 1, Classes: [], Enums: [] }), "utf8");
  await writeFile(join(testCacheDir, "api-docs-en-us.json"), "{}", "utf8");
  await writeFile(join(testCacheDir, "metadata.json"), `${JSON.stringify(META, null, 2)}\n`, "utf8");
}

test("(a) complete cache + failing version.txt fetch returns skipped with a warning naming lastSync", async () => {
  await seedSyncedCache();

  const result = await syncRobloxData(false, "en-us");

  assert.equal(result.skipped, true);
  assert.deepEqual(result.downloaded, []);
  assert.ok(result.warning, "expected a warning string");
  assert.match(result.warning, /Could not reach upstream version\.txt/);
  assert.match(result.warning, /2026-11-01T00:00:00\.000Z/);
});

test("(b) empty cache + failing version.txt fetch still throws", async () => {
  await assert.rejects(() => syncRobloxData(false, "en-us"), /network is unreachable/);
});

test("(c) force: true + failing version.txt fetch still throws even with a complete cache", async () => {
  await seedSyncedCache();

  await assert.rejects(() => syncRobloxData(true, "en-us"), /network is unreachable/);
});

test("(d) aborted signal + failing version.txt fetch still throws even with a complete cache", async () => {
  await seedSyncedCache();

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => syncRobloxData(false, "en-us", controller.signal));
});

test("(e) offline-reuse path leaves the cache files and metadata.json unchanged on disk", async () => {
  await seedSyncedCache();
  const beforeDump = await readFile(join(testCacheDir, "api-dump.json"), "utf8");
  const beforeDocs = await readFile(join(testCacheDir, "api-docs-en-us.json"), "utf8");
  const beforeMeta = await readFile(join(testCacheDir, "metadata.json"), "utf8");

  const result = await syncRobloxData(false, "en-us");
  assert.equal(result.skipped, true);

  assert.equal(await readFile(join(testCacheDir, "api-dump.json"), "utf8"), beforeDump);
  assert.equal(await readFile(join(testCacheDir, "api-docs-en-us.json"), "utf8"), beforeDocs);
  assert.equal(await readFile(join(testCacheDir, "metadata.json"), "utf8"), beforeMeta);
});
