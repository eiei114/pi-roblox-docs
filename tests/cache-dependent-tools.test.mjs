import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearRobloxCache } from "../extensions/roblox-docs.ts";
import registerRobloxDocsExtension from "../extensions/roblox-docs.ts";

const cacheDependentTools = JSON.parse(
  await readFile(new URL("./fixtures/cache-dependent-tools.json", import.meta.url), "utf8"),
);

const toolParams = {
  roblox_search: { query: "Part" },
  roblox_get_class: { className: "Part" },
  roblox_get_member: { className: "Part", memberName: "Anchored" },
  roblox_lookup_enum: { query: "EasingStyle" },
  roblox_get_enum: { enumName: "EasingStyle" },
  roblox_get_luau_global: { name: "math" },
};

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
let testCacheDir;

test.beforeEach(async () => {
  originalCacheDir = process.env.PI_ROBLOX_DOCS_CACHE_DIR;
  testCacheDir = join(tmpdir(), `pi-roblox-docs-cache-tools-${process.pid}-${Math.random().toString(36).slice(2)}`);
  process.env.PI_ROBLOX_DOCS_CACHE_DIR = testCacheDir;
  await mkdir(testCacheDir, { recursive: true });
  await clearRobloxCache();
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

for (const toolName of cacheDependentTools) {
  test(`cache-dependent tool ${toolName} returns not_synced payload when cache is missing`, async () => {
    const { tools, pi } = createMockPi();
    registerRobloxDocsExtension(pi);

    const tool = tools.get(toolName);
    assert.ok(tool, `missing registerTool registration for ${toolName}`);

    const result = await tool.execute("test-call", toolParams[toolName], new AbortController().signal);
    const text = result.content?.[0]?.text ?? "";

    assert.match(text, /Roblox docs cache is missing\. Call roblox_sync first\./);
    assert.match(text, new RegExp(`Cache path: ${testCacheDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(result.details?.error, "not_synced");
    assert.equal(result.details?.cacheDir, testCacheDir);
  });
}
