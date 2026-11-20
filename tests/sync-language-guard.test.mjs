import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
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
let testCachePath;

test.beforeEach(async () => {
  originalCacheDir = process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  testCachePath = join(tmpdir(), `pi-roblox-docs-language-guard-${process.pid}-${Math.random().toString(36).slice(2)}`);
  await writeFile(testCachePath, "cache must not be touched", "utf8");
  process.env.PI_ROBLOX_DOCS_CACHE_DIR = testCachePath;
});

test.afterEach(async () => {
  if (testCachePath) {
    await rm(testCachePath, { force: true });
  }
  if (originalCacheDir === undefined) {
    delete process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  } else {
    process.env.PI_ROBLOX_DOCS_CACHE_DIR = originalCacheDir;
  }
});

test("roblox_sync rejects unsupported languages before cache access or upstream fetch", async () => {
  const { tools, pi } = createMockPi();
  registerRobloxDocsExtension(pi);

  const tool = tools.get("roblox_sync");
  assert.ok(tool, "missing registerTool registration for roblox_sync");
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ["force", "language"]);
  assert.equal(tool.parameters.properties.force.default, false);
  assert.equal(tool.parameters.properties.language.default, "en-us");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let cacheAccesses = 0;
  const cacheRoot = resolve(testCachePath);
  const trackedFsMethods = ["mkdir", "readFile", "stat", "writeFile"];
  const originalFsMethods = new Map(trackedFsMethods.map((name) => [name, fs[name]]));

  for (const name of trackedFsMethods) {
    fs[name] = async (...args) => {
      const target = resolve(String(args[0]));
      if (target === cacheRoot || target.startsWith(`${cacheRoot}${sep}`)) {
        cacheAccesses += 1;
        throw new Error("cache access must not be attempted");
      }
      return originalFsMethods.get(name).apply(fs, args);
    };
  }
  syncBuiltinESMExports();

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("upstream fetch must not be attempted");
  };

  try {
    await assert.rejects(
      tool.execute("test-call", { language: "ja-jp" }, new AbortController().signal),
      { message: "MVP only supports en-us; got ja-jp" },
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, method] of originalFsMethods) {
      fs[name] = method;
    }
    syncBuiltinESMExports();
  }

  assert.equal(cacheAccesses, 0, "unsupported language must be rejected before cache access");
  assert.equal(fetchCalls, 0, "unsupported language must be rejected before fetch");
  assert.equal(await readFile(testCachePath, "utf8"), "cache must not be touched");
});
