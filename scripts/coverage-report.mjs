#!/usr/bin/env node
/**
 * Report API-Dump class, member and enum totals, and compare the raw dump
 * against what the extension actually indexes.
 *
 * Usage:
 *   node scripts/coverage-report.mjs [path-to-api-dump.json] [--json]
 *
 * With no path argument, reads the synced cache file `api-dump.json` under
 * PI_ROBLOX_DOCS_CACHE_DIR or the OS cache dir (same location the extension
 * uses). Never fetches over the network.
 *
 * Exit codes:
 *   0  report printed and dump totals match indexed totals
 *   1  report printed but dump totals differ from indexed totals
 *   2  usage error, unreadable/invalid dump file
 */
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildLoadedData,
  summarizeApiDump,
  summarizeLoadedData,
} from "../extensions/roblox-docs.ts";

const CANONICAL_MEMBER_KINDS = ["Property", "Function", "Event", "Callback"];

// Mirrors getCacheDir() in extensions/roblox-docs.ts; kept local so the script
// stays a no-new-dependency, dev-only tool.
function defaultCacheDir() {
  if (process.env.PI_ROBLOX_DOCS_CACHE_DIR) return process.env.PI_ROBLOX_DOCS_CACHE_DIR;

  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "pi-roblox-docs");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "pi-roblox-docs");
  }

  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "pi-roblox-docs");
}

function defaultApiDumpPath() {
  return path.join(defaultCacheDir(), "api-dump.json");
}

function usage() {
  console.error("Usage: node scripts/coverage-report.mjs [path-to-api-dump.json] [--json]");
}

/**
 * A real API-Dump.json is an object with Classes and Enums arrays. Rejecting
 * anything else here (e.g. an error payload such as {"error":"download failed"})
 * prevents the summarizers' `?? []` fallbacks from turning a broken download
 * into an all-zero, "match: yes", exit-0 false success.
 */
function isValidApiDump(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.Classes) &&
    Array.isArray(value.Enums)
  );
}

function memberKindKeys(dump, indexed) {
  const keys = new Set(CANONICAL_MEMBER_KINDS);
  for (const key of Object.keys(dump.membersByKind)) keys.add(key);
  for (const key of Object.keys(indexed.membersByKind)) keys.add(key);
  const canonical = CANONICAL_MEMBER_KINDS.filter((kind) => keys.delete(kind));
  return [...canonical, ...[...keys].sort()];
}

function summariesMatch(dump, indexed) {
  if (
    dump.classes !== indexed.classes ||
    dump.totalMembers !== indexed.totalMembers ||
    dump.deprecatedMembers !== indexed.deprecatedMembers ||
    dump.enums !== indexed.enums ||
    dump.enumItems !== indexed.enumItems
  ) {
    return false;
  }
  const keys = new Set([...Object.keys(dump.membersByKind), ...Object.keys(indexed.membersByKind)]);
  for (const key of keys) {
    if ((dump.membersByKind[key] ?? 0) !== (indexed.membersByKind[key] ?? 0)) return false;
  }
  return true;
}

function printTextReport(source, dump, indexed, match) {
  const lines = [
    "API Dump coverage report",
    `source: ${source}`,
    `classes: ${dump.classes} vs ${indexed.classes}`,
    `total members: ${dump.totalMembers} vs ${indexed.totalMembers}`,
    "members by kind:",
  ];
  for (const kind of memberKindKeys(dump, indexed)) {
    lines.push(`  ${kind}: ${dump.membersByKind[kind] ?? 0} vs ${indexed.membersByKind[kind] ?? 0}`);
  }
  lines.push(`deprecated members: ${dump.deprecatedMembers} vs ${indexed.deprecatedMembers}`);
  lines.push(`enums: ${dump.enums} vs ${indexed.enums}`);
  lines.push(`enum items: ${dump.enumItems} vs ${indexed.enumItems}`);
  lines.push(`match: ${match ? "yes" : "no"}`);
  console.log(lines.join("\n"));
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");

  if (positional.length > 1) {
    usage();
    process.exit(2);
  }

  const source = positional[0] ?? defaultApiDumpPath();

  let raw;
  try {
    raw = await readFile(source, "utf8");
  } catch (error) {
    console.error(`Failed to read API dump at ${source}: ${error.message}`);
    console.error("Run roblox_sync first (or pass an explicit path to an API-Dump.json file).");
    process.exit(2);
  }

  let dump;
  try {
    dump = JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to parse API dump at ${source}: ${error.message}`);
    process.exit(2);
  }

  if (!isValidApiDump(dump)) {
    console.error(`Invalid API dump at ${source}: expected an object with Classes and Enums arrays.`);
    process.exit(2);
  }

  const dumpSummary = summarizeApiDump(dump);
  const indexedSummary = summarizeLoadedData(buildLoadedData(dump, {}, {}));
  const match = summariesMatch(dumpSummary, indexedSummary);

  if (json) {
    console.log(JSON.stringify({ source, dump: dumpSummary, indexed: indexedSummary, match }, null, 2));
  } else {
    printTextReport(source, dumpSummary, indexedSummary, match);
  }

  process.exit(match ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
