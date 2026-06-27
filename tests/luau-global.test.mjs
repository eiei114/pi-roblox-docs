import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLuauGlobalsIndex,
  formatLuauGlobal,
  formatLuauGlobalMiss,
  lookupLuauGlobal,
  suggestLuauGlobals,
} from "../extensions/luau-globals.ts";

const sampleDocs = JSON.parse(
  await readFile(new URL("./fixtures/luau-globals-sample.json", import.meta.url), "utf8"),
);
const index = buildLuauGlobalsIndex(sampleDocs);

test("buildLuauGlobalsIndex includes Luau libraries and Roblox globals but not datatypes", () => {
  assert.ok(lookupLuauGlobal(index, "math"));
  assert.ok(lookupLuauGlobal(index, "typeof"));
  assert.ok(lookupLuauGlobal(index, "task"));
  assert.equal(lookupLuauGlobal(index, "DateTime"), undefined);
  assert.equal(index.names.length, 4);
});

test("lookupLuauGlobal resolves exact matches case-insensitively", () => {
  const item = lookupLuauGlobal(index, "MATH.ABS");
  assert.ok(item);
  assert.equal(item.name, "math.abs");
  const output = formatLuauGlobal(item);
  assert.match(output, /LUAU GLOBAL: math\.abs/);
  assert.match(output, /Returns the absolute value/);
});

test("suggestLuauGlobals returns bounded suggestions for close misses", () => {
  const suggestions = suggestLuauGlobals(index, "mat", 3);
  assert.deepEqual(suggestions, ["math", "math.abs"]);
  const miss = formatLuauGlobalMiss("not-a-global", []);
  assert.match(miss, /Luau global "not-a-global" not found\./);
  assert.match(miss, /roblox_get_class/);
});
