import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import registerRobloxDocsExtension, { syncRobloxData } from "../extensions/roblox-docs.ts";

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

function response(text) {
  return { ok: true, status: 200, statusText: "OK", text: async () => text };
}

function createMockPi() {
  const tools = new Map();
  return {
    tools,
    pi: {
      on() {},
      registerTool(definition) { tools.set(definition.name, definition); },
      registerCommand() {},
    },
  };
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

test("(f) offline fallback rejects a mismatched API dump and an online retry repairs it", async () => {
  await seedSyncedCache();
  await writeFile(join(testCacheDir, "api-dump.json"), JSON.stringify({ Version: 2, Classes: [], Enums: [] }), "utf8");

  await assert.rejects(() => syncRobloxData(false, "en-us"), /network is unreachable/);

  globalThis.fetch = async (url) => {
    if (url.endsWith("version.txt")) return response(META.version);
    if (url.endsWith("API-Dump.json")) return response(JSON.stringify({ Version: 1, Classes: [], Enums: [] }));
    if (url.endsWith("api-docs/en-us.json")) return response('{"cacheGeneration":1}');
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await syncRobloxData(false, "en-us");
  assert.equal(result.skipped, false);
  assert.deepEqual(result.downloaded, ["api-dump.json", "api-docs-en-us.json"]);
  assert.deepEqual(JSON.parse(await readFile(join(testCacheDir, "api-dump.json"), "utf8")), { Version: 1, Classes: [], Enums: [] });
  assert.deepEqual(JSON.parse(await readFile(join(testCacheDir, "api-docs-en-us.json"), "utf8")), { cacheGeneration: 1 });
  assert.equal(JSON.parse(await readFile(join(testCacheDir, "metadata.json"), "utf8")).apiDumpVersion, 1);
});

test("(g) a docs-download interruption preserves the previous complete cache for offline reuse and online retry", async () => {
  await seedSyncedCache();
  globalThis.fetch = async (url) => {
    if (url.endsWith("version.txt")) return response("version-2");
    if (url.endsWith("API-Dump.json")) return response(JSON.stringify({ Version: 2, Classes: [], Enums: [] }));
    if (url.endsWith("api-docs/en-us.json")) throw new Error("docs temporarily unavailable");
    throw new Error(`unexpected URL: ${url}`);
  };

  await assert.rejects(() => syncRobloxData(false, "en-us"), /docs temporarily unavailable/);
  assert.deepEqual(JSON.parse(await readFile(join(testCacheDir, "api-dump.json"), "utf8")), { Version: 1, Classes: [], Enums: [] });
  assert.equal(await readFile(join(testCacheDir, "api-docs-en-us.json"), "utf8"), "{}");
  assert.deepEqual(JSON.parse(await readFile(join(testCacheDir, "metadata.json"), "utf8")), META);

  globalThis.fetch = async () => { throw new Error("network is unreachable"); };
  const offline = await syncRobloxData(false, "en-us");
  assert.equal(offline.skipped, true);
  assert.match(offline.warning, /using cached Roblox docs/);

  globalThis.fetch = async (url) => {
    if (url.endsWith("version.txt")) return response("version-2");
    if (url.endsWith("API-Dump.json")) return response(JSON.stringify({ Version: 2, Classes: [], Enums: [] }));
    if (url.endsWith("api-docs/en-us.json")) return response('{"cacheGeneration":2}');
    throw new Error(`unexpected URL: ${url}`);
  };
  const retry = await syncRobloxData(false, "en-us");
  assert.equal(retry.skipped, false);
  assert.equal(retry.version, "version-2");
  assert.equal(JSON.parse(await readFile(join(testCacheDir, "api-dump.json"), "utf8")).Version, 2);
  assert.deepEqual(JSON.parse(await readFile(join(testCacheDir, "api-docs-en-us.json"), "utf8")), { cacheGeneration: 2 });
  assert.equal(JSON.parse(await readFile(join(testCacheDir, "metadata.json"), "utf8")).apiDumpVersion, 2);
});

test("(h) roblox_sync tool text says it is reusing cache, not that it is current", async () => {
  await seedSyncedCache();
  const { tools, pi } = createMockPi();
  registerRobloxDocsExtension(pi);

  const result = await tools.get("roblox_sync").execute(
    "test-call",
    { force: false, language: "en-us" },
    new AbortController().signal,
    undefined,
    { ui: { setStatus() {} } },
  );

  const text = result.content?.[0]?.text ?? "";
  assert.match(text, /Warning: .*using cached Roblox docs from 2026-11-01T00:00:00\.000Z/);
  assert.match(text, /cache is being reused; the upstream version could not be verified/i);
  assert.doesNotMatch(text, /already current/i);
  assert.match(result.details.warning, /2026-11-01T00:00:00\.000Z/);
});
