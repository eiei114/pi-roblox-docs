import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildLuauGlobalsIndex,
  formatLuauGlobal,
  formatLuauGlobalMiss,
  lookupLuauGlobal,
  suggestLuauGlobals,
} from "./luau-globals.js";

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox";
const USER_AGENT = "pi-roblox-docs/0.2.0";
const DEFAULT_LANGUAGE = "en-us";
const MAX_OUTPUT_CHARS = 45_000;
const DEFAULT_SEARCH_LIMIT = 15;
const MAX_SEARCH_LIMIT = 50;
const DEVFORUM_CACHE_TTL_MS = 60 * 60 * 1000;
const DEVFORUM_RATE_LIMIT_MS = 1000;

const SOURCES = {
  apiDump: `${GITHUB_RAW_BASE}/API-Dump.json`,
  apiDocs: (language: string) => `${GITHUB_RAW_BASE}/api-docs/${language}.json`,
  version: `${GITHUB_RAW_BASE}/version.txt`,
};

type ValueType = { Name?: string; Category?: string } | string | null | undefined;

interface ApiParameter {
  Name?: string;
  Type?: ValueType;
  Default?: unknown;
}

interface ApiMember {
  MemberType?: string;
  Name?: string;
  ValueType?: ValueType;
  ReturnType?: ValueType;
  Parameters?: ApiParameter[];
  Security?: Record<string, string> | string;
  Tags?: string[];
  ThreadSafety?: string;
  Default?: unknown;
}

interface ApiClass {
  Name?: string;
  Superclass?: string;
  Members?: ApiMember[];
  Tags?: string[];
  MemoryCategory?: string;
}

interface ApiEnumItem {
  Name?: string;
  Value?: number;
}

interface ApiEnum {
  Name?: string;
  Items?: ApiEnumItem[];
}

interface ApiDump {
  Version?: number;
  Classes?: ApiClass[];
  Enums?: ApiEnum[];
}

interface CacheMeta {
  version?: string | null;
  apiDumpVersion?: number | null;
  language?: string;
  lastSync?: string;
  sources?: string[];
}

interface SearchResult {
  type: "class" | "member" | "enum";
  name: string;
  className?: string;
  memberType?: string;
  description: string;
  tags: string[];
  score: number;
}

import type { LuauGlobalsIndex } from "./luau-globals.js";

interface LoadedData {
  dump: ApiDump;
  docs: Record<string, unknown>;
  docsMap: Map<string, Map<string, string>>;
  classMap: Map<string, ApiClass>;
  enumMap: Map<string, ApiEnum>;
  inheritanceMap: Map<string, string[]>;
  searchItems: SearchResult[];
  luauGlobals: LuauGlobalsIndex;
  meta: CacheMeta;
}

interface DevForumTopic {
  id?: number;
  title?: string;
  slug?: string;
  category_id?: number;
  posts_count?: number;
  reply_count?: number;
  like_count?: number;
  views?: number;
  created_at?: string;
  last_posted_at?: string;
}

interface DevForumCacheFile {
  version: 1;
  savedAt: string;
  entries: Record<string, { query: string; fetchedAt: string; topics: DevForumTopic[] }>;
}

let loadedData: LoadedData | undefined;
let devForumLastRequest = 0;

function getCacheDir(): string {
  if (process.env.PI_ROBLOX_DOCS_CACHE_DIR) return process.env.PI_ROBLOX_DOCS_CACHE_DIR;

  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "pi-roblox-docs");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "pi-roblox-docs");
  }

  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "pi-roblox-docs");
}

function cachePaths(language = DEFAULT_LANGUAGE) {
  const dir = getCacheDir();
  return {
    dir,
    apiDump: path.join(dir, "api-dump.json"),
    apiDocs: path.join(dir, `api-docs-${language}.json`),
    devForumCache: path.join(dir, "devforum-cache.json"),
    meta: path.join(dir, "metadata.json"),
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readMeta(language = DEFAULT_LANGUAGE): Promise<CacheMeta> {
  const paths = cachePaths(language);
  if (!(await exists(paths.meta))) return {};
  try {
    return await readJson<CacheMeta>(paths.meta);
  } catch {
    return {};
  }
}

async function fetchText(url: string, signal?: AbortSignal, retries = 3): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json,text/plain,*/*",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (attempt < retries - 1) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function syncRobloxData(force: boolean, language: string, signal?: AbortSignal, onUpdate?: (update: { content: Array<{ type: "text"; text: string }>; details: unknown }) => void): Promise<CacheMeta & { cacheDir: string; downloaded: string[]; skipped: boolean }> {
  const paths = cachePaths(language);
  await mkdir(paths.dir, { recursive: true });

  const localMeta = await readMeta(language);
  const hasRequiredFiles = (await exists(paths.apiDump)) && (await exists(paths.apiDocs));

  onUpdate?.({ content: [{ type: "text", text: "Checking Roblox API version..." }], details: {} });
  const remoteVersion = (await fetchText(SOURCES.version, signal)).trim();

  if (!force && hasRequiredFiles && localMeta.version === remoteVersion) {
    return { ...localMeta, cacheDir: paths.dir, downloaded: [], skipped: true };
  }

  const downloaded: string[] = [];

  onUpdate?.({ content: [{ type: "text", text: "Downloading API-Dump.json..." }], details: {} });
  const apiDumpText = await fetchText(SOURCES.apiDump, signal);
  await writeFile(paths.apiDump, apiDumpText, "utf8");
  downloaded.push("api-dump.json");

  onUpdate?.({ content: [{ type: "text", text: `Downloading api-docs/${language}.json...` }], details: {} });
  const apiDocsText = await fetchText(SOURCES.apiDocs(language), signal);
  await writeFile(paths.apiDocs, apiDocsText, "utf8");
  downloaded.push(`api-docs-${language}.json`);

  const parsedDump = JSON.parse(apiDumpText) as ApiDump;
  const meta: CacheMeta = {
    version: remoteVersion,
    apiDumpVersion: parsedDump.Version ?? null,
    language,
    lastSync: new Date().toISOString(),
    sources: ["api_dump", "api_docs", "version"],
  };
  await writeFile(paths.meta, JSON.stringify(meta, null, 2), "utf8");
  loadedData = undefined;

  return { ...meta, cacheDir: paths.dir, downloaded, skipped: false };
}

export async function clearRobloxCache(): Promise<{ cacheDir: string; existed: boolean }> {
  const dir = getCacheDir();
  const existed = await exists(dir);
  if (existed) {
    await rm(dir, { recursive: true, force: true });
  }
  loadedData = undefined;
  return { cacheDir: dir, existed };
}

export function formatClearCacheMessage(result: { cacheDir: string; existed: boolean }): string {
  const statusLine = result.existed
    ? `Roblox docs cache cleared.\nDeleted: ${result.cacheDir}`
    : `Roblox docs cache was already empty.\nCache path: ${result.cacheDir}`;
  return `${statusLine}\n\nRun roblox_sync before roblox_search and other API lookups work again.`;
}

export async function inspectCacheHealth(language = DEFAULT_LANGUAGE): Promise<{
  cacheDir: string;
  hasApiDump: boolean;
  hasApiDocs: boolean;
  indexed: boolean;
}> {
  const paths = cachePaths(language);
  const [hasApiDump, hasApiDocs] = await Promise.all([exists(paths.apiDump), exists(paths.apiDocs)]);
  const data = await loadData(language);
  return { cacheDir: paths.dir, hasApiDump, hasApiDocs, indexed: Boolean(data) };
}

async function readDevForumCache(): Promise<DevForumCacheFile> {
  const paths = cachePaths(DEFAULT_LANGUAGE);
  if (!(await exists(paths.devForumCache))) {
    return { version: 1, savedAt: new Date(0).toISOString(), entries: {} };
  }

  try {
    const data = await readJson<DevForumCacheFile>(paths.devForumCache);
    if (data.version !== 1 || typeof data.entries !== "object" || data.entries === null) {
      return { version: 1, savedAt: new Date(0).toISOString(), entries: {} };
    }
    return data;
  } catch {
    return { version: 1, savedAt: new Date(0).toISOString(), entries: {} };
  }
}

async function writeDevForumCache(cache: DevForumCacheFile): Promise<void> {
  const paths = cachePaths(DEFAULT_LANGUAGE);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.devForumCache, JSON.stringify({ ...cache, savedAt: new Date().toISOString() }, null, 2), "utf8");
}

function devForumCacheKey(query: string): string {
  return query.trim().toLowerCase();
}

async function searchDevForum(query: string, limit: number, signal?: AbortSignal, force = false): Promise<{ query: string; topics: DevForumTopic[]; cached: boolean; stale: boolean }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error("DevForum query cannot be empty.");

  const cache = await readDevForumCache();
  const key = devForumCacheKey(normalizedQuery);
  const cachedEntry = cache.entries[key];
  const now = Date.now();

  if (!force && cachedEntry) {
    const ageMs = now - Date.parse(cachedEntry.fetchedAt);
    if (Number.isFinite(ageMs) && ageMs < DEVFORUM_CACHE_TTL_MS) {
      return { query: normalizedQuery, topics: cachedEntry.topics.slice(0, limit), cached: true, stale: false };
    }
  }

  const elapsed = now - devForumLastRequest;
  if (elapsed < DEVFORUM_RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, DEVFORUM_RATE_LIMIT_MS - elapsed));
  }

  try {
    const url = new URL("https://devforum.roblox.com/search.json");
    url.searchParams.set("q", normalizedQuery);
    devForumLastRequest = Date.now();
    const raw = await fetchText(url.toString(), signal, 2);
    const payload = JSON.parse(raw) as { topics?: DevForumTopic[] };
    const topics = Array.isArray(payload.topics) ? payload.topics : [];

    cache.entries[key] = { query: normalizedQuery, fetchedAt: new Date().toISOString(), topics };

    // Keep cache bounded and remove expired entries opportunistically.
    const sortedEntries = Object.entries(cache.entries)
      .filter(([, entry]) => Date.now() - Date.parse(entry.fetchedAt) < DEVFORUM_CACHE_TTL_MS * 24)
      .sort((a, b) => Date.parse(b[1].fetchedAt) - Date.parse(a[1].fetchedAt))
      .slice(0, 100);
    cache.entries = Object.fromEntries(sortedEntries);
    await writeDevForumCache(cache);

    return { query: normalizedQuery, topics: topics.slice(0, limit), cached: false, stale: false };
  } catch (error) {
    if (cachedEntry) {
      return { query: normalizedQuery, topics: cachedEntry.topics.slice(0, limit), cached: true, stale: true };
    }
    throw error;
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function splitTokens(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function valueTypeName(valueType: ValueType, fallback = "unknown"): string {
  if (!valueType) return fallback;
  if (typeof valueType === "string") return valueType;
  return valueType.Name ?? fallback;
}

function importantTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((tag) => ["Deprecated", "Service", "NotCreatable", "ReadOnly", "Hidden", "Yields", "NotReplicated"].includes(tag));
}

function buildDocsMap(docs: Record<string, unknown>): Map<string, Map<string, string>> {
  const docsMap = new Map<string, Map<string, string>>();

  for (const [key, value] of Object.entries(docs)) {
    if (!key.startsWith("@roblox/globaltype/") || typeof value !== "object" || value === null) continue;
    const documentation = (value as { documentation?: unknown }).documentation;
    if (typeof documentation !== "string" || documentation.trim().length === 0) continue;

    const apiPath = key.slice("@roblox/globaltype/".length);
    const [className, memberName] = apiPath.split(".", 2);
    if (!className) continue;

    const normalizedClass = normalizeName(className);
    const classDocs = docsMap.get(normalizedClass) ?? new Map<string, string>();
    docsMap.set(normalizedClass, classDocs);

    if (!memberName) classDocs.set("_class", documentation);
    else if (!memberName.includes(".")) classDocs.set(normalizeName(memberName), documentation);
  }

  return docsMap;
}

function getClassDoc(data: LoadedData, className: string): string {
  return data.docsMap.get(normalizeName(className))?.get("_class") ?? "";
}

function getMemberDoc(data: LoadedData, className: string, memberName: string): string {
  return data.docsMap.get(normalizeName(className))?.get(normalizeName(memberName)) ?? "";
}

function buildInheritance(classMap: Map<string, ApiClass>, className: string): string[] {
  const chain: string[] = [];
  let current = className;
  const seen = new Set<string>();

  while (current && current !== "<<<ROOT>>>") {
    const normalized = normalizeName(current);
    if (seen.has(normalized)) break;
    seen.add(normalized);
    const cls = classMap.get(normalized);
    if (!cls?.Name) break;
    chain.push(cls.Name);
    current = cls.Superclass ?? "";
  }

  return chain;
}

function describeMember(member: ApiMember): string {
  const type = member.MemberType ?? "Member";
  if (type === "Property") return `Property: ${valueTypeName(member.ValueType)}`;
  if (type === "Method" || type === "Function") {
    const params = (member.Parameters ?? []).map((param) => param.Name ?? "arg").join(", ");
    return `Method(${params}) -> ${valueTypeName(member.ReturnType, "void")}`;
  }
  if (type === "Event") {
    const params = (member.Parameters ?? []).map((param) => param.Name ?? "arg").join(", ");
    return `Event(${params})`;
  }
  if (type === "Callback") return `Callback -> ${valueTypeName(member.ReturnType, "void")}`;
  return type;
}

function buildLoadedData(dump: ApiDump, docs: Record<string, unknown>, meta: CacheMeta): LoadedData {
  const classMap = new Map<string, ApiClass>();
  const enumMap = new Map<string, ApiEnum>();
  const inheritanceMap = new Map<string, string[]>();
  const docsMap = buildDocsMap(docs);
  const searchItems: SearchResult[] = [];

  for (const cls of dump.Classes ?? []) {
    if (!cls.Name) continue;
    classMap.set(normalizeName(cls.Name), cls);
  }

  for (const enumInfo of dump.Enums ?? []) {
    if (!enumInfo.Name) continue;
    enumMap.set(normalizeName(enumInfo.Name), enumInfo);
  }

  const luauGlobals = buildLuauGlobalsIndex(docs);
  const dataShell = { dump, docs, docsMap, classMap, enumMap, inheritanceMap, searchItems, luauGlobals, meta } satisfies LoadedData;

  for (const cls of dump.Classes ?? []) {
    if (!cls.Name) continue;
    inheritanceMap.set(normalizeName(cls.Name), buildInheritance(classMap, cls.Name));
    const classDoc = getClassDoc(dataShell, cls.Name);
    searchItems.push({
      type: "class",
      name: cls.Name,
      description: classDoc ? firstSentence(classDoc, 220) : `Class inheriting from ${cls.Superclass ?? "root"}`,
      tags: cls.Tags ?? [],
      score: 0,
    });

    for (const member of cls.Members ?? []) {
      if (!member.Name) continue;
      const memberDoc = getMemberDoc(dataShell, cls.Name, member.Name);
      searchItems.push({
        type: "member",
        name: member.Name,
        className: cls.Name,
        memberType: member.MemberType,
        description: memberDoc ? firstSentence(memberDoc, 220) : describeMember(member),
        tags: member.Tags ?? [],
        score: 0,
      });
    }
  }

  for (const enumInfo of dump.Enums ?? []) {
    if (!enumInfo.Name) continue;
    searchItems.push({
      type: "enum",
      name: enumInfo.Name,
      description: `Enum with ${enumInfo.Items?.length ?? 0} values`,
      tags: [],
      score: 0,
    });
  }

  return dataShell;
}

async function loadData(language = DEFAULT_LANGUAGE): Promise<LoadedData | undefined> {
  if (loadedData && loadedData.meta.language === language) return loadedData;

  const paths = cachePaths(language);
  if (!(await exists(paths.apiDump)) || !(await exists(paths.apiDocs))) return undefined;

  const [dump, docs, meta] = await Promise.all([
    readJson<ApiDump>(paths.apiDump),
    readJson<Record<string, unknown>>(paths.apiDocs),
    readMeta(language),
  ]);

  loadedData = buildLoadedData(dump, docs, meta);
  return loadedData;
}

function firstSentence(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return compact.slice(0, maxChars - 1).trimEnd() + "…";
}

function truncateOutput(text: string, maxChars = MAX_OUTPUT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars).trimEnd()}\n\n[Output truncated at ${maxChars.toLocaleString()} chars.]`,
    truncated: true,
  };
}

function clampLimit(limit: unknown, defaultValue: number, maxValue: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return defaultValue;
  return Math.max(1, Math.min(maxValue, Math.floor(limit)));
}

function scoreSearchItem(item: SearchResult, query: string): number {
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

function search(data: LoadedData, query: string, limit: number): SearchResult[] {
  const scored = data.searchItems
    .map((item) => ({ ...item, score: scoreSearchItem(item, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const item of scored) {
    const key = `${item.type}:${item.className ?? ""}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

function formatSearchResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `No Roblox API results for "${query}". Try another query or run roblox_sync if the cache is stale.`;
  }

  const lines = [`Search results for "${query}" (${results.length} shown):`, ""];
  results.forEach((result, index) => {
    const icon = result.type === "class" ? "[C]" : result.type === "member" ? "[M]" : "[E]";
    const fullName = result.className ? `${result.className}.${result.name}` : result.name;
    const tags = importantTags(result.tags);
    const tagText = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    const nextTool = result.type === "class" ? `roblox_get_class({ className: "${result.name}" })` : result.type === "member" ? `roblox_get_member({ className: "${result.className}", memberName: "${result.name}" })` : `roblox_get_enum({ enumName: "${result.name}" })`;
    lines.push(`${String(index + 1).padStart(2, " ")}. ${icon} ${fullName}${tagText}`);
    lines.push(`    ${result.description}`);
    lines.push(`    Next: ${nextTool}`);
  });
  return lines.join("\n");
}

function formatParameters(parameters: ApiParameter[] | undefined): string {
  return (parameters ?? [])
    .map((param) => {
      const defaultValue = param.Default === undefined ? "" : ` = ${String(param.Default)}`;
      return `${param.Name ?? "arg"}: ${valueTypeName(param.Type, "any")}${defaultValue}`;
    })
    .join(", ");
}

function formatProperty(member: ApiMember): string {
  const tags = importantTags(member.Tags);
  const tagText = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  return `  ${member.Name}: ${valueTypeName(member.ValueType)}${tagText}`;
}

function formatMethod(member: ApiMember): string {
  const tags = importantTags(member.Tags);
  const tagText = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  return `  ${member.Name}(${formatParameters(member.Parameters)}) -> ${valueTypeName(member.ReturnType, "void")}${tagText}`;
}

function formatEvent(member: ApiMember): string {
  const tags = importantTags(member.Tags);
  const tagText = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  return `  ${member.Name}(${formatParameters(member.Parameters)})${tagText}`;
}

function formatClass(data: LoadedData, cls: ApiClass, includeMembers: boolean, memberLimit: number): string {
  const name = cls.Name ?? "Unknown";
  const lines: string[] = [`CLASS: ${name}`];
  if (cls.Superclass && cls.Superclass !== "<<<ROOT>>>") lines.push(`Inherits: ${cls.Superclass}`);
  if (cls.Tags?.length) lines.push(`Tags: ${cls.Tags.join(", ")}`);
  if (cls.MemoryCategory) lines.push(`MemoryCategory: ${cls.MemoryCategory}`);

  const doc = getClassDoc(data, name);
  if (doc) lines.push("", "DESCRIPTION:", firstSentence(doc, 1200));

  const chain = data.inheritanceMap.get(normalizeName(name));
  if (chain && chain.length > 1) lines.push("", `INHERITANCE: ${chain.join(" -> ")}`);

  if (includeMembers) {
    const members = cls.Members ?? [];
    const groups: Array<[string, ApiMember[]]> = [
      ["PROPERTIES", members.filter((member) => member.MemberType === "Property")],
      ["METHODS", members.filter((member) => member.MemberType === "Method" || member.MemberType === "Function")],
      ["EVENTS", members.filter((member) => member.MemberType === "Event")],
      ["CALLBACKS", members.filter((member) => member.MemberType === "Callback")],
    ];

    for (const [title, groupMembers] of groups) {
      if (groupMembers.length === 0) continue;
      lines.push("", `${title} (${groupMembers.length}):`);
      const shown = groupMembers.slice(0, memberLimit);
      for (const member of shown) {
        if (title === "PROPERTIES") lines.push(formatProperty(member));
        else if (title === "EVENTS") lines.push(formatEvent(member));
        else lines.push(formatMethod(member));
      }
      if (groupMembers.length > shown.length) lines.push(`  ... ${groupMembers.length - shown.length} more. Increase memberLimit for more.`);
    }
  }

  lines.push("", `DOCS: https://create.roblox.com/docs/reference/engine/classes/${encodeURIComponent(name)}`);
  return truncateOutput(lines.join("\n")).text;
}

function findMember(data: LoadedData, className: string, memberName: string): { owner: ApiClass; member: ApiMember } | undefined {
  const cls = data.classMap.get(normalizeName(className));
  if (!cls?.Name) return undefined;
  const chain = data.inheritanceMap.get(normalizeName(cls.Name)) ?? [cls.Name];
  for (const ownerName of chain) {
    const owner = data.classMap.get(normalizeName(ownerName));
    const member = owner?.Members?.find((candidate) => normalizeName(candidate.Name ?? "") === normalizeName(memberName));
    if (owner && member) return { owner, member };
  }
  return undefined;
}

function formatMember(data: LoadedData, owner: ApiClass, requestedClassName: string, member: ApiMember): string {
  const className = owner.Name ?? requestedClassName;
  const name = member.Name ?? "Unknown";
  const lines = [`${(member.MemberType ?? "MEMBER").toUpperCase()}: ${className}.${name}`];
  if (className !== requestedClassName) lines.push(`Inherited by: ${requestedClassName}`);
  if (member.Tags?.length) lines.push(`Tags: ${member.Tags.join(", ")}`);
  if (member.ThreadSafety) lines.push(`ThreadSafety: ${member.ThreadSafety}`);

  if (member.MemberType === "Property") {
    lines.push(`Type: ${valueTypeName(member.ValueType)}`);
    if (member.Default !== undefined) lines.push(`Default: ${String(member.Default)}`);
    if (typeof member.Security === "object" && member.Security) {
      lines.push(`Security: Read=${member.Security.Read ?? "None"}, Write=${member.Security.Write ?? "None"}`);
    }
  } else if (member.MemberType === "Method" || member.MemberType === "Function" || member.MemberType === "Callback") {
    lines.push(`Signature: ${name}(${formatParameters(member.Parameters)}) -> ${valueTypeName(member.ReturnType, "void")}`);
    if (member.Tags?.includes("Yields")) lines.push("Note: This member yields.");
  } else if (member.MemberType === "Event") {
    lines.push(`Signature: ${name}(${formatParameters(member.Parameters)})`);
  }

  const doc = getMemberDoc(data, className, name);
  if (doc) lines.push("", "DESCRIPTION:", firstSentence(doc, 1600));
  if (member.Tags?.includes("Deprecated")) lines.push("", "WARNING: This member is deprecated.");

  lines.push("", `DOCS: https://create.roblox.com/docs/reference/engine/classes/${encodeURIComponent(className)}#${encodeURIComponent(name)}`);
  return truncateOutput(lines.join("\n")).text;
}

function formatEnum(enumInfo: ApiEnum): string {
  const name = enumInfo.Name ?? "Unknown";
  const items = [...(enumInfo.Items ?? [])].sort((a, b) => (a.Value ?? 0) - (b.Value ?? 0));
  const lines = [`ENUM: ${name}`, `Values (${items.length}):`, ""];
  for (const item of items) lines.push(`  ${item.Name ?? "Unknown"} = ${item.Value ?? 0}`);
  lines.push("", `DOCS: https://create.roblox.com/docs/reference/engine/enums/${encodeURIComponent(name)}`);
  return truncateOutput(lines.join("\n")).text;
}

function devForumCategoryName(categoryId: number | undefined): string {
  const categories: Record<number, string> = {
    4: "Help and Feedback",
    6: "Resources",
    10: "Scripting Support",
    11: "Building Support",
    12: "Art Design Support",
    45: "Code Review",
    55: "Community Tutorials",
  };
  return categoryId ? categories[categoryId] ?? `Category ${categoryId}` : "Discussion";
}

function devForumUrl(topic: DevForumTopic): string {
  if (topic.slug && topic.id) return `https://devforum.roblox.com/t/${topic.slug}/${topic.id}`;
  return `https://devforum.roblox.com/t/${topic.id ?? ""}`;
}

function formatDevForumResults(result: { query: string; topics: DevForumTopic[]; cached: boolean; stale: boolean }): string {
  const cacheNote = result.stale ? " (cached, may be stale)" : result.cached ? " (cached)" : "";
  if (result.topics.length === 0) {
    return `No DevForum results for "${result.query}"${cacheNote}. Try different keywords.`;
  }

  const lines = [`DevForum results for "${result.query}" (${result.topics.length} shown)${cacheNote}:`, ""];
  result.topics.forEach((topic, index) => {
    lines.push(`${index + 1}. ${topic.title ?? "Untitled"}`);
    lines.push(`   Category: ${devForumCategoryName(topic.category_id)}`);
    const stats = [`posts ${topic.posts_count ?? "?"}`, `views ${topic.views ?? "?"}`];
    if (typeof topic.like_count === "number") stats.push(`likes ${topic.like_count}`);
    lines.push(`   Stats: ${stats.join(", ")}`);
    if (topic.last_posted_at) lines.push(`   Last posted: ${topic.last_posted_at}`);
    lines.push(`   Link: ${devForumUrl(topic)}`);
    lines.push("");
  });
  lines.push("Note: DevForum results are community discussions, not official API guarantees.");
  return truncateOutput(lines.join("\n")).text;
}

function notSyncedMessage(): string {
  return `Roblox docs cache is missing. Call roblox_sync first.\nCache path: ${getCacheDir()}`;
}

function toolText(text: string, details: Record<string, unknown> = {}): any {
  return { content: [{ type: "text", text }], details };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (await exists(cachePaths(DEFAULT_LANGUAGE).apiDump)) {
      ctx.ui.setStatus("roblox-docs", "roblox-docs: cached");
    } else {
      ctx.ui.setStatus("roblox-docs", "roblox-docs: run roblox_sync");
    }
  });

  pi.registerTool({
    name: "roblox_sync",
    label: "Roblox Sync",
    description: "Download or update local Roblox API documentation cache. Does not start an MCP server or background daemon.",
    promptSnippet: "Download/update Roblox docs cache for local Pi-native lookup",
    promptGuidelines: [
      "Use roblox_sync before Roblox API lookups if roblox_health reports a missing or stale cache.",
      "roblox_sync downloads public Roblox documentation data and does not start a background MCP server.",
    ],
    parameters: Type.Object({
      force: Type.Optional(Type.Boolean({ default: false, description: "Force re-download even when local version matches remote." })),
      language: Type.Optional(Type.String({ default: DEFAULT_LANGUAGE, description: "Documentation language. MVP supports en-us." })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const language = params.language || DEFAULT_LANGUAGE;
      if (language !== DEFAULT_LANGUAGE) {
        throw new Error(`MVP only supports ${DEFAULT_LANGUAGE}; got ${language}`);
      }

      const result = await syncRobloxData(params.force === true, language, signal, onUpdate);
      ctx.ui.setStatus("roblox-docs", "roblox-docs: cached");
      const text = result.skipped
        ? `Roblox docs cache is already current.\nVersion: ${result.version ?? "unknown"}\nCache: ${result.cacheDir}`
        : `Roblox docs sync complete.\nVersion: ${result.version ?? "unknown"}\nAPI dump version: ${result.apiDumpVersion ?? "unknown"}\nDownloaded: ${result.downloaded.join(", ")}\nCache: ${result.cacheDir}`;
      return toolText(text, result as unknown as Record<string, unknown>);
    },
  });

  pi.registerTool({
    name: "roblox_clear_cache",
    label: "Roblox Clear Cache",
    description: "Delete the local pi-roblox-docs cache. Does not affect project files or the Obsidian vault.",
    promptSnippet: "Delete local Roblox docs cache",
    promptGuidelines: [
      "Use roblox_clear_cache when the user asks to clear Roblox docs cache or reset pi-roblox-docs local data.",
      "roblox_clear_cache only deletes the package-owned pi-roblox-docs cache directory; it does not touch project files or other Pi caches.",
      "After roblox_clear_cache, tell the user to run roblox_sync before search and API lookup tools work again.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const result = await clearRobloxCache();
      ctx.ui.setStatus("roblox-docs", "roblox-docs: run roblox_sync");
      return toolText(formatClearCacheMessage(result), { ...result, syncRequired: true });
    },
  });

  pi.registerTool({
    name: "roblox_health",
    label: "Roblox Health",
    description: "Show local Roblox docs cache, version, and index status.",
    promptSnippet: "Inspect Roblox docs cache and index health",
    promptGuidelines: ["Use roblox_health to diagnose missing or stale Roblox docs data before searching."],
    parameters: Type.Object({}),
    async execute() {
      const paths = cachePaths(DEFAULT_LANGUAGE);
      const [hasApiDump, hasApiDocs, meta] = await Promise.all([exists(paths.apiDump), exists(paths.apiDocs), readMeta(DEFAULT_LANGUAGE)]);
      const data = await loadData(DEFAULT_LANGUAGE);
      const lines = ["ROBLOX DOCS HEALTH", "", `Cache: ${paths.dir}`, `API dump cached: ${hasApiDump ? "yes" : "no"}`, `API docs cached: ${hasApiDocs ? "yes" : "no"}`, `Language: ${meta.language ?? DEFAULT_LANGUAGE}`, `Remote version: ${meta.version ?? "unknown"}`, `API dump version: ${meta.apiDumpVersion ?? data?.dump.Version ?? "unknown"}`, `Last sync: ${meta.lastSync ?? "never"}`];
      if (data) {
        lines.push("", "INDEX:", `Classes: ${data.dump.Classes?.length ?? 0}`, `Members: ${(data.dump.Classes ?? []).reduce((sum, cls) => sum + (cls.Members?.length ?? 0), 0)}`, `Enums: ${data.dump.Enums?.length ?? 0}`, `Luau globals: ${data.luauGlobals.names.length}`, `Search items: ${data.searchItems.length}`);
      } else {
        lines.push("", "INDEX: not built (run roblox_sync first)");
      }
      return toolText(lines.join("\n"), { cacheDir: paths.dir, hasApiDump, hasApiDocs, meta, indexed: Boolean(data) });
    },
  });

  pi.registerTool({
    name: "roblox_search",
    label: "Roblox Search",
    description: "Search local Roblox API docs across classes, members, and enums.",
    promptSnippet: "Search Roblox API classes, members, and enums from local cache",
    promptGuidelines: ["Use roblox_search for Roblox API questions before guessing API names or using web search."],
    parameters: Type.Object({
      query: Type.String({ description: "Search query, e.g. 'tween animation', 'player character', 'EasingStyle'." }),
      limit: Type.Optional(Type.Number({ default: DEFAULT_SEARCH_LIMIT, description: `Max results, 1-${MAX_SEARCH_LIMIT}.` })),
    }),
    async execute(_toolCallId, params) {
      const data = await loadData(DEFAULT_LANGUAGE);
      if (!data) return toolText(notSyncedMessage(), { error: "not_synced", cacheDir: getCacheDir() });
      const limit = clampLimit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
      const results = search(data, params.query, limit);
      const output = formatSearchResults(results, params.query);
      return toolText(output, { query: params.query, count: results.length, results });
    },
  });

  pi.registerTool({
    name: "roblox_search_devforum",
    label: "Roblox DevForum Search",
    description: "Search Roblox Developer Forum community discussions with a 1-hour local disk cache and basic rate limiting.",
    promptSnippet: "Search Roblox DevForum community discussions",
    promptGuidelines: [
      "Use roblox_search_devforum when official Roblox API docs are not enough and the user wants community solutions, tutorials, errors, or best practices.",
      "Mention that roblox_search_devforum results are community discussions, not official API guarantees.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "DevForum search query, e.g. 'memory optimization', 'datastore retry', 'pathfinding'." }),
      limit: Type.Optional(Type.Number({ default: 10, description: "Max results, 1-25." })),
      force: Type.Optional(Type.Boolean({ default: false, description: "Bypass cached DevForum results." })),
    }),
    async execute(_toolCallId, params, signal) {
      const limit = clampLimit(params.limit, 10, 25);
      const result = await searchDevForum(params.query, limit, signal, params.force === true);
      return toolText(formatDevForumResults(result), result as unknown as Record<string, unknown>);
    },
  });

  pi.registerTool({
    name: "roblox_get_class",
    label: "Roblox Class",
    description: "Get complete information about a Roblox class from local docs cache.",
    promptSnippet: "Get a Roblox class with description, inheritance, and grouped members",
    promptGuidelines: ["Use roblox_get_class after roblox_search identifies a Roblox class."],
    parameters: Type.Object({
      className: Type.String({ description: "Class name, e.g. TweenService, Part, Player." }),
      includeMembers: Type.Optional(Type.Boolean({ default: true, description: "Include grouped properties/methods/events/callbacks." })),
      memberLimit: Type.Optional(Type.Number({ default: 50, description: "Maximum members shown per group." })),
    }),
    async execute(_toolCallId, params) {
      const data = await loadData(DEFAULT_LANGUAGE);
      if (!data) return toolText(notSyncedMessage(), { error: "not_synced", cacheDir: getCacheDir() });
      const cls = data.classMap.get(normalizeName(params.className));
      if (!cls) {
        const suggestions = search(data, params.className, 5).filter((result) => result.type === "class").map((result) => result.name);
        return toolText(`Class "${params.className}" not found.${suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""}`, { error: "not_found", suggestions });
      }
      const output = formatClass(data, cls, params.includeMembers !== false, clampLimit(params.memberLimit, 50, 200));
      return toolText(output, { className: cls.Name, memberCount: cls.Members?.length ?? 0 });
    },
  });

  pi.registerTool({
    name: "roblox_get_member",
    label: "Roblox Member",
    description: "Get detailed information about a Roblox class member, including inherited members.",
    promptSnippet: "Get a Roblox class member signature, tags, and docs",
    promptGuidelines: ["Use roblox_get_member when the user asks about a specific Roblox property, method, event, or callback."],
    parameters: Type.Object({
      className: Type.String({ description: "Class name, e.g. TweenService, Part." }),
      memberName: Type.String({ description: "Member name, e.g. Create, Anchored, Touched." }),
    }),
    async execute(_toolCallId, params) {
      const data = await loadData(DEFAULT_LANGUAGE);
      if (!data) return toolText(notSyncedMessage(), { error: "not_synced", cacheDir: getCacheDir() });
      const found = findMember(data, params.className, params.memberName);
      if (!found) {
        const cls = data.classMap.get(normalizeName(params.className));
        const suggestions = (cls?.Members ?? []).filter((member) => normalizeName(member.Name ?? "").includes(normalizeName(params.memberName))).slice(0, 8).map((member) => member.Name);
        return toolText(`Member "${params.memberName}" not found in ${params.className}.${suggestions.length ? ` Similar: ${suggestions.join(", ")}` : ""}`, { error: "not_found", suggestions: suggestions.filter(Boolean) });
      }
      const output = formatMember(data, found.owner, params.className, found.member);
      return toolText(output, { className: found.owner.Name, memberName: found.member.Name, memberType: found.member.MemberType });
    },
  });

  pi.registerTool({
    name: "roblox_get_enum",
    label: "Roblox Enum",
    description: "Get all values of a Roblox enum from local docs cache.",
    promptSnippet: "Get Roblox enum values",
    promptGuidelines: ["Use roblox_get_enum when the user asks for valid Roblox enum values."],
    parameters: Type.Object({
      enumName: Type.String({ description: "Enum name, e.g. EasingStyle, Material, PartType." }),
    }),
    async execute(_toolCallId, params) {
      const data = await loadData(DEFAULT_LANGUAGE);
      if (!data) return toolText(notSyncedMessage(), { error: "not_synced", cacheDir: getCacheDir() });
      const enumInfo = data.enumMap.get(normalizeName(params.enumName));
      if (!enumInfo) {
        const suggestions = search(data, params.enumName, 5).filter((result) => result.type === "enum").map((result) => result.name);
        return toolText(`Enum "${params.enumName}" not found.${suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""}`, { error: "not_found", suggestions });
      }
      const output = formatEnum(enumInfo);
      return toolText(output, { enumName: enumInfo.Name, itemCount: enumInfo.Items?.length ?? 0 });
    },
  });

  pi.registerTool({
    name: "roblox_get_luau_global",
    label: "Roblox Luau Global",
    description: "Look up documented Luau built-ins and Roblox globals/libraries such as math, task, and typeof from local docs cache.",
    promptSnippet: "Look up Luau built-ins and Roblox globals/libraries",
    promptGuidelines: [
      "Use roblox_get_luau_global for Luau built-ins (math, string, coroutine) and Roblox globals/libraries (task, typeof, game).",
      "Use roblox_get_class / roblox_get_member / roblox_get_enum for Roblox instance classes, members, and enums.",
    ],
    parameters: Type.Object({
      name: Type.String({ description: "Global or library name, e.g. math, math.abs, task.wait, typeof." }),
      memberLimit: Type.Optional(Type.Number({ default: 40, description: "Maximum members shown for library globals." })),
    }),
    async execute(_toolCallId, params) {
      const data = await loadData(DEFAULT_LANGUAGE);
      if (!data) return toolText(notSyncedMessage(), { error: "not_synced", cacheDir: getCacheDir() });
      const item = lookupLuauGlobal(data.luauGlobals, params.name);
      if (!item) {
        const suggestions = suggestLuauGlobals(data.luauGlobals, params.name, 8);
        return toolText(formatLuauGlobalMiss(params.name, suggestions), { error: "not_found", suggestions });
      }
      const output = truncateOutput(formatLuauGlobal(item, { memberLimit: clampLimit(params.memberLimit, 40, 200) })).text;
      const kind = item.entry.keys
        ? "library"
        : Array.isArray(item.entry.params)
          ? "function"
          : "global";
      return toolText(output, { name: item.name, source: item.source, kind });
    },
  });

  pi.registerCommand("roblox:sync", {
    description: "Sync local Roblox docs cache (use --force to redownload)",
    handler: async (args, ctx) => {
      const force = args.split(/\s+/).includes("--force") || args.split(/\s+/).includes("force");
      ctx.ui.notify("Syncing Roblox docs cache...", "info");
      const result = await syncRobloxData(force, DEFAULT_LANGUAGE, ctx.signal, (update) => {
        const text = update.content.map((part) => part.text).join("\n");
        ctx.ui.setStatus("roblox-docs", text);
      });
      ctx.ui.setStatus("roblox-docs", "roblox-docs: cached");
      const message = result.skipped
        ? `Roblox docs cache is already current (${result.version ?? "unknown"}).`
        : `Roblox docs sync complete (${result.version ?? "unknown"}). Downloaded: ${result.downloaded.join(", ")}`;
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("roblox:health", {
    description: "Show local Roblox docs cache health",
    handler: async (_args, ctx) => {
      const paths = cachePaths(DEFAULT_LANGUAGE);
      const [hasApiDump, hasApiDocs, meta] = await Promise.all([exists(paths.apiDump), exists(paths.apiDocs), readMeta(DEFAULT_LANGUAGE)]);
      const data = await loadData(DEFAULT_LANGUAGE);
      const text = [
        "ROBLOX DOCS HEALTH",
        `Cache: ${paths.dir}`,
        `API dump cached: ${hasApiDump ? "yes" : "no"}`,
        `API docs cached: ${hasApiDocs ? "yes" : "no"}`,
        `Version: ${meta.version ?? "unknown"}`,
        `Last sync: ${meta.lastSync ?? "never"}`,
        data ? `Classes: ${data.dump.Classes?.length ?? 0}, Enums: ${data.dump.Enums?.length ?? 0}, Luau globals: ${data.luauGlobals.names.length}` : "Index: not built",
      ].join("\n");
      ctx.ui.notify(text, hasApiDump && hasApiDocs ? "info" : "warning");
    },
  });

  pi.registerCommand("roblox:devforum", {
    description: "Search Roblox DevForum (usage: /roblox:devforum memory optimization)",
    handler: async (args, ctx) => {
      const query = args.trim();
      if (!query) {
        ctx.ui.notify("Usage: /roblox:devforum <query>", "warning");
        return;
      }
      ctx.ui.notify(`Searching DevForum for: ${query}`, "info");
      try {
        const result = await searchDevForum(query, 10, ctx.signal, false);
        ctx.ui.notify(formatDevForumResults(result), "info");
      } catch (error) {
        ctx.ui.notify(`DevForum search failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.registerCommand("roblox:clear-cache", {
    description: "Delete local Roblox docs cache",
    handler: async (_args, ctx) => {
      const ok = await ctx.ui.confirm("Clear Roblox docs cache?", `Delete local cache at:\n${getCacheDir()}\n\nProject files will not be touched.`);
      if (!ok) {
        ctx.ui.notify("Cancelled Roblox docs cache clear.", "info");
        return;
      }
      const result = await clearRobloxCache();
      ctx.ui.setStatus("roblox-docs", "roblox-docs: run roblox_sync");
      ctx.ui.notify(formatClearCacheMessage(result), "info");
    },
  });
}

