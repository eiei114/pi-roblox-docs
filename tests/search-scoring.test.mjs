import assert from "node:assert/strict";
import test from "node:test";
import { splitTokens } from "../extensions/text-utils.ts";
import { search } from "../extensions/roblox-docs.ts";

function makeSearchItem(overrides) {
  const name = overrides.name;
  const className = overrides.className;
  const fullName = className ? `${className}.${name}` : name;
  return {
    type: overrides.type ?? "class",
    name,
    className,
    memberType: overrides.memberType,
    description: overrides.description ?? "",
    tags: overrides.tags ?? [],
    score: 0,
    nameLower: name.toLowerCase(),
    fullNameLower: fullName.toLowerCase(),
    nameTokens: splitTokens(fullName),
  };
}

function makeData(items) {
  return { searchItems: items };
}

test("search ranks exact class matches ahead of partial member hits", () => {
  const data = makeData([
    makeSearchItem({ type: "member", name: "Create", className: "TweenService", description: "Creates a tween" }),
    makeSearchItem({ type: "class", name: "TweenService", description: "Tween animation service" }),
    makeSearchItem({ type: "member", name: "TweenService", className: "Other", description: "Unrelated member" }),
  ]);

  const results = search(data, "TweenService", 5);
  assert.equal(results[0]?.name, "TweenService");
  assert.equal(results[0]?.type, "class");
});

test("search tokenizes multi-word queries and prefers name token matches", () => {
  const data = makeData([
    makeSearchItem({ type: "class", name: "Player", description: "Represents a player" }),
    makeSearchItem({ type: "member", name: "Character", className: "Player", description: "The player's character model" }),
    makeSearchItem({ type: "enum", name: "CharacterAppearance", description: "Enum with appearance values" }),
  ]);

  const results = search(data, "player character", 5);
  assert.ok(results.some((item) => item.className === "Player" && item.name === "Character"));
});

test("search deprioritizes deprecated members with identical name matches", () => {
  const data = makeData([
    makeSearchItem({ type: "member", name: "Value", className: "Object", tags: ["Deprecated"], description: "Deprecated value" }),
    makeSearchItem({ type: "member", name: "Value", className: "StringValue", tags: [], description: "Current value property" }),
  ]);

  const results = search(data, "Value", 5);
  assert.equal(results[0]?.className, "StringValue");
});

test("search returns empty results for blank tokenized queries", () => {
  const data = makeData([
    makeSearchItem({ type: "class", name: "Part", description: "A base part" }),
  ]);

  assert.deepEqual(search(data, "a", 5), []);
});
