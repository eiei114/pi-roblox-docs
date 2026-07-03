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

test("lookupEnum resolves separator-insensitive exact matches", () => {
  const item = lookupEnum(index, "easing style");
  assert.ok(item);
  assert.equal(item.Name, "EasingStyle");
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

test("suggestEnums avoids noisy cross-token matches for multi-word queries", () => {
  const suggestions = suggestEnums(index, "humanoid state", 5);
  assert.ok(suggestions.length > 0);
  assert.equal(suggestions[0].name, "HumanoidStateType");
  assert.ok(suggestions.length <= 2);
});

test("suggestEnums ignores stop-word-only queries like NotAnEnum", () => {
  const suggestions = suggestEnums(index, "NotAnEnum", 5);
  assert.deepEqual(suggestions, []);
});

test("suggestEnums does not treat mode as a prefix of Model enums", () => {
  const suggestions = suggestEnums(index, "mode", 5).map((item) => item.name);
  assert.ok(suggestions.includes("ControlMode"));
  assert.ok(!suggestions.includes("ModelLevelOfDetail"));
});

test("suggestEnums uses significant token after stop-word filtering", () => {
  const suggestions = suggestEnums(index, "the mode", 5).map((item) => item.name);
  assert.ok(suggestions.includes("ControlMode"));
  assert.ok(!suggestions.includes("ModelLevelOfDetail"));
});

test("suggestEnums keeps the top match when relative cutoff would exceed its score", () => {
  const suggestions = suggestEnums(index, "abcdefg0", 5);
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((item) => item.score >= 30));
  assert.ok(suggestions.some((item) => item.name === "ABCDEFGHI"));
});

test("suggestEnums avoids weak near matches for short unrelated queries", () => {
  const suggestions = suggestEnums(index, "sort", 5).map((item) => item.name);
  assert.ok(suggestions.includes("SortDirection"));
  assert.ok(!suggestions.includes("Font"));
});

test("formatEnumLookupMiss is explicit when no close enum match exists", () => {
  const suggestions = suggestEnums(index, "NotAnEnum", 5);
  assert.deepEqual(suggestions, []);
  const miss = formatEnumLookupMiss("NotAnEnum");
  assert.match(miss, /No Roblox enum match for "NotAnEnum"/);
  assert.match(miss, /No close enum names were found/);
  assert.match(miss, /roblox_get_enum when you already know the exact enum name/);
});
