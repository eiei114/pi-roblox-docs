import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildEnumLookupIndex,
  formatEnumLookupMiss,
  formatEnumLookupResult,
  formatEnumSuggestions,
  lookupEnum,
  suggestEnums,
} from "../extensions/enum-aliases.ts";

const sampleEnums = JSON.parse(
  await readFile(new URL("./fixtures/enum-aliases-sample.json", import.meta.url), "utf8"),
);
const index = buildEnumLookupIndex(sampleEnums);

test("lookupEnum resolves exact matches case-insensitively", () => {
  const item = lookupEnum(index, "easingstyle");
  assert.ok(item);
  assert.equal(item.Name, "EasingStyle");
  const output = formatEnumLookupResult("easingstyle", item);
  assert.match(output, /Exact enum match for "easingstyle"/);
  assert.match(output, /ENUM: EasingStyle/);
  assert.match(output, /Linear = 0/);
});

test("suggestEnums returns bounded alias and near-miss targets", () => {
  const aliasSuggestions = suggestEnums(index, "easing style", 3);
  assert.deepEqual(aliasSuggestions.map((item) => item.name), ["EasingStyle"]);

  const typoSuggestions = suggestEnums(index, "Materail", 3);
  assert.deepEqual(typoSuggestions.map((item) => item.name), ["Material"]);

  const prefixSuggestions = suggestEnums(index, "key", 3);
  assert.deepEqual(prefixSuggestions.map((item) => item.name), ["KeyCode"]);

  const output = formatEnumSuggestions("easing style", aliasSuggestions);
  assert.match(output, /No exact enum match for "easing style"/);
  assert.match(output, /roblox_get_enum\(\{ enumName: "EasingStyle" \}\)/);
});

test("formatEnumLookupMiss is explicit when no close enum match exists", () => {
  const suggestions = suggestEnums(index, "NotAnEnum", 5);
  assert.deepEqual(suggestions, []);
  const miss = formatEnumLookupMiss("NotAnEnum");
  assert.match(miss, /No Roblox enum match for "NotAnEnum"/);
  assert.match(miss, /No close enum names were found/);
  assert.match(miss, /roblox_get_enum when you already know the exact enum name/);
});
