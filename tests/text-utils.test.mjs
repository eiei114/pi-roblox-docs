import assert from "node:assert/strict";
import test from "node:test";
import {
  clampLimit,
  firstSentence,
  splitTokens,
  truncateOutput,
} from "../extensions/text-utils.ts";

test("firstSentence compacts whitespace and truncates with ellipsis", () => {
  assert.equal(firstSentence("  hello   world  ", 100), "hello world");
  assert.equal(firstSentence("abcdefghij", 5), "abcd…");
});

test("splitTokens splits camelCase and acronyms into lowercase tokens", () => {
  assert.deepEqual(splitTokens("EasingStyle"), ["easing", "style"]);
  assert.deepEqual(splitTokens("HTTPRequest"), ["http", "request"]);
  assert.deepEqual(splitTokens("a"), []);
});

test("truncateOutput leaves short text unchanged and marks long text truncated", () => {
  const short = truncateOutput("hello", 10);
  assert.equal(short.text, "hello");
  assert.equal(short.truncated, false);

  const long = truncateOutput("x".repeat(20), 10);
  assert.equal(long.truncated, true);
  assert.match(long.text, /\[Output truncated at 10 chars\.\]/);
});

test("clampLimit falls back to defaults and clamps to max", () => {
  assert.equal(clampLimit(undefined, 15, 50), 15);
  assert.equal(clampLimit(0, 15, 50), 1);
  assert.equal(clampLimit(999, 15, 50), 50);
  assert.equal(clampLimit(12.9, 15, 50), 12);
});
