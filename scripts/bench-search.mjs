#!/usr/bin/env node
/**
 * Micro-benchmark for roblox_search scoring hot path.
 * Usage: node scripts/bench-search.mjs
 */
import { performance } from "node:perf_hooks";
import { splitTokens } from "../extensions/text-utils.ts";

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function scoreSearchItemBaseline(item, query) {
  const queryLower = query.toLowerCase().trim();
  const queryTokens = splitTokens(queryLower);
  if (queryTokens.length === 0) return 0;

  const fullName = item.className ? `${item.className}.${item.name}` : item.name;
  const nameLower = item.name.toLowerCase();
  const fullNameLower = fullName.toLowerCase();
  const nameTokens = splitTokens(fullName);
  const haystack = `${fullName} ${item.type} ${item.memberType ?? ""} ${item.description} ${(item.tags ?? []).join(" ")}`.toLowerCase();

  let score = 0;
  if (fullNameLower === queryLower || nameLower === queryLower) score += 300;
  if (fullNameLower.startsWith(queryLower) || nameLower.startsWith(queryLower)) score += 120;
  if (fullNameLower.includes(queryLower) || nameLower.includes(queryLower)) score += 80;

  for (const token of queryTokens) {
    if (nameTokens.includes(token)) score += 40;
    else if (nameTokens.some((nameToken) => nameToken.startsWith(token))) score += 25;
    else if (fullNameLower.includes(token)) score += 15;
    else if (haystack.includes(token)) score += 8;
  }

  if (item.type === "class") score += 8;
  if (item.tags.includes("Deprecated")) score -= 5;
  return score;
}

function searchBaseline(items, query, limit) {
  const queryLower = query.toLowerCase().trim();
  const queryTokens = splitTokens(queryLower);
  const scored = items
    .map((item) => ({ ...item, score: scoreSearchItemBaseline(item, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const seen = new Set();
  const results = [];
  for (const item of scored) {
    const key = `${item.type}:${item.className ?? ""}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

function buildSyntheticItems(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const className = `TestClass${i % 400}`;
    items.push({
      type: i % 17 === 0 ? "class" : i % 5 === 0 ? "enum" : "member",
      name: i % 17 === 0 ? className : i % 5 === 0 ? `EnumType${i}` : `Member${i}`,
      className: i % 17 === 0 ? undefined : i % 5 === 0 ? undefined : className,
      memberType: "Property",
      description: `Description for synthetic item ${i} with tween animation player character`,
      tags: i % 23 === 0 ? ["Deprecated"] : [],
      score: 0,
    });
  }
  return items;
}

function buildOptimizedItems(items) {
  return items.map((item) => {
    const fullName = item.className ? `${item.className}.${item.name}` : item.name;
    return {
      ...item,
      nameLower: item.name.toLowerCase(),
      fullNameLower: fullName.toLowerCase(),
      nameTokens: splitTokens(fullName),
    };
  });
}

function scoreSearchItemOptimized(item, ctx) {
  if (ctx.queryTokens.length === 0) return 0;

  let score = 0;
  if (item.fullNameLower === ctx.queryLower || item.nameLower === ctx.queryLower) score += 300;
  if (item.fullNameLower.startsWith(ctx.queryLower) || item.nameLower.startsWith(ctx.queryLower)) score += 120;
  if (item.fullNameLower.includes(ctx.queryLower) || item.nameLower.includes(ctx.queryLower)) score += 80;

  let haystack;
  for (const token of ctx.queryTokens) {
    if (item.nameTokens.includes(token)) score += 40;
    else if (item.nameTokens.some((nameToken) => nameToken.startsWith(token))) score += 25;
    else if (item.fullNameLower.includes(token)) score += 15;
    else {
      haystack ??= `${item.fullNameLower} ${item.type} ${item.memberType ?? ""} ${item.description} ${item.tags.join(" ")}`;
      if (haystack.includes(token)) score += 8;
    }
  }

  if (item.type === "class") score += 8;
  if (item.tags.includes("Deprecated")) score -= 5;
  return score;
}

function searchOptimized(items, query, limit) {
  const ctx = {
    queryLower: query.toLowerCase().trim(),
    queryTokens: splitTokens(query.toLowerCase().trim()),
  };
  const scored = items
    .map((item) => ({ ...item, score: scoreSearchItemOptimized(item, ctx) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const seen = new Set();
  const results = [];
  for (const item of scored) {
    const key = `${item.type}:${item.className ?? ""}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

const ITEM_COUNT = 12_000;
const QUERIES = ["TweenService", "player character", "EasingStyle", "Anchored", "tween animation"];
const RUNS = 30;
const LIMIT = 15;

const rawItems = buildSyntheticItems(ITEM_COUNT);
const optimizedItems = buildOptimizedItems(rawItems);

for (const query of QUERIES) {
  const baseline = searchBaseline(rawItems, query, LIMIT);
  const optimized = searchOptimized(optimizedItems, query, LIMIT);
  const baselineNames = baseline.map((item) => `${item.type}:${item.className ?? ""}:${item.name}`);
  const optimizedNames = optimized.map((item) => `${item.type}:${item.className ?? ""}:${item.name}`);
  if (baselineNames.join("|") !== optimizedNames.join("|")) {
    console.error(`Ranking mismatch for query "${query}"`);
    process.exit(1);
  }
}

function bench(fn) {
  const start = performance.now();
  for (let run = 0; run < RUNS; run++) {
    for (const query of QUERIES) fn(query);
  }
  return performance.now() - start;
}

const baselineMs = bench((query) => searchBaseline(rawItems, query, LIMIT));
const optimizedMs = bench((query) => searchOptimized(optimizedItems, query, LIMIT));

console.log(JSON.stringify({
  itemCount: ITEM_COUNT,
  queries: QUERIES.length,
  runs: RUNS,
  baselineMs: Math.round(baselineMs),
  optimizedMs: Math.round(optimizedMs),
  speedup: Number((baselineMs / optimizedMs).toFixed(2)),
}, null, 2));
