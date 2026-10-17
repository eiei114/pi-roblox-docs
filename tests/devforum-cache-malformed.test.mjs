import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import registerRobloxDocsExtension from "../extensions/roblox-docs.ts";

function createMockPi() {
  const tools = new Map();
  return {
    tools,
    pi: {
      on() {},
      registerTool(def) {
        tools.set(def.name, def);
      },
      registerCommand() {},
    },
  };
}

let originalCacheDir;
let originalFetch;
let testCacheDir;

test.beforeEach(async () => {
  originalCacheDir = process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  originalFetch = globalThis.fetch;
  testCacheDir = join(tmpdir(), `pi-roblox-docs-devforum-malformed-${process.pid}-${Math.random().toString(36).slice(2)}`);
  process.env.PI_ROBLOX_DOCS_CACHE_DIR = testCacheDir;
  await mkdir(testCacheDir, { recursive: true });
});

test.afterEach(async () => {
  globalThis.fetch = originalFetch;
  await rm(testCacheDir, { recursive: true, force: true });
  if (originalCacheDir === undefined) {
    delete process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  } else {
    process.env.PI_ROBLOX_DOCS_CACHE_DIR = originalCacheDir;
  }
});

test("registered DevForum search recovers from a malformed cache and rewrites it", async () => {
  await writeFile(join(testCacheDir, "devforum-cache.json"), "{ malformed JSON", "utf8");

  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(new URL(input));
    return {
      ok: true,
      text: async () => JSON.stringify({
        topics: [{ id: 42, title: "DataStore retries", slug: "datastore-retries", category_id: 10 }],
      }),
    };
  };

  const { tools, pi } = createMockPi();
  registerRobloxDocsExtension(pi);
  const tool = tools.get("roblox_search_devforum");
  assert.ok(tool, "missing registerTool registration for roblox_search_devforum");

  const result = await tool.execute("test-call", { query: " DataStore " }, new AbortController().signal);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, "/search.json");
  assert.equal(requests[0].searchParams.get("q"), "DataStore");
  assert.equal(result.details?.query, "DataStore");
  assert.equal(result.details?.cached, false);
  assert.equal(result.details?.stale, false);
  assert.deepEqual(result.details?.topics.map(({ id, title }) => ({ id, title })), [
    { id: 42, title: "DataStore retries" },
  ]);
  assert.match(result.content?.[0]?.text ?? "", /DevForum results for "DataStore"/);

  const repairedCache = JSON.parse(await readFile(join(testCacheDir, "devforum-cache.json"), "utf8"));
  assert.equal(repairedCache.version, 1);
  assert.equal(repairedCache.entries.datastore.query, "DataStore");
  assert.deepEqual(repairedCache.entries.datastore.topics, [
    { id: 42, title: "DataStore retries", slug: "datastore-retries", category_id: 10 },
  ]);
});
