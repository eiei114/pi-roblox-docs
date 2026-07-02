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

test("formatLuauGlobal handles overload entries like table.insert", () => {
  const item = lookupLuauGlobal(index, "table.insert");
  assert.ok(item, "table.insert should be in index (overload entry)");
  const output = formatLuauGlobal(item);
  assert.match(output, /LUAU GLOBAL: table\.insert/);
  assert.match(output, /OVERLOADS \(2\):/);
  assert.match(output, /table\.insert\(table, number, Variant\) -> \(\)/);
  assert.match(output, /table\.insert\(table, Variant\) -> \(\)/);
  assert.match(output, /DOCS: https:\/\/create\.roblox\.com\/docs\/reference\/engine\/libraries\/table#insert/);
});

test("lookupLuauGlobal case-insensitivity reveals script vs Script confusion boundary", () => {
  // The global `script` (lowercase) is a reference to the current LuaSourceContainer.
  // If a user types "Script" (capitalized, thinking of the class), the
  // case-insensitive lookup finds `script`, which is a different concept.
  const scriptGlobal = lookupLuauGlobal(index, "script");
  assert.ok(scriptGlobal, "script global should be found");
  assert.equal(scriptGlobal.name, "script");
  assert.equal(scriptGlobal.source, "roblox");

  // Same result with capitalized query — this is the confusion boundary:
  const scriptAsClass = lookupLuauGlobal(index, "Script");
  assert.ok(scriptAsClass, "Script (capitalized) finds `script` via case-insensitive match");
  assert.equal(scriptAsClass.name, "script");

  const output = formatLuauGlobal(scriptGlobal);
  assert.match(output, /ROBLOX GLOBAL: script/);
  assert.match(output, /A reference to the LuaSourceContainer/);
});
