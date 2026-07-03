export interface ApiEnumItem {
  Name?: string;
  Value?: number;
}

export interface ApiEnum {
  Name?: string;
  Items?: ApiEnumItem[];
}

export interface EnumLookupIndex {
  byName: Map<string, ApiEnum>;
  names: string[];
}

export interface EnumSuggestion {
  name: string;
  score: number;
  matchKind: "exact" | "prefix" | "contains" | "token" | "near";
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const TOKEN_STOP_WORDS = new Set(["a", "an", "the", "not", "no", "for", "and", "or", "to", "of", "in", "on", "at", "by"]);

function splitTokens(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function significantQueryTokens(query: string): string[] {
  return splitTokens(query).filter((token) => !TOKEN_STOP_WORDS.has(token));
}

function enumWords(enumName: string): string[] {
  return enumName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word.length >= 2);
}

function levenshtein(a: string, b: string, maxDistance: number): number | null {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return null;

  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, index) => index);
  let curr = new Array<number>(cols);

  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > maxDistance) return null;
    [prev, curr] = [curr, prev];
  }

  const distance = prev[cols - 1];
  return distance <= maxDistance ? distance : null;
}

export function buildEnumLookupIndex(enums: ApiEnum[]): EnumLookupIndex {
  const byName = new Map<string, ApiEnum>();
  const names: string[] = [];

  for (const enumInfo of enums) {
    if (!enumInfo.Name) continue;
    const lowerName = enumInfo.Name.trim().toLowerCase();
    if (byName.has(lowerName)) continue;
    byName.set(lowerName, enumInfo);
    const normalizedName = normalizeQuery(enumInfo.Name);
    if (normalizedName && !byName.has(normalizedName)) byName.set(normalizedName, enumInfo);
    names.push(enumInfo.Name);
  }

  names.sort((a, b) => a.localeCompare(b));
  return { byName, names };
}

export function lookupEnum(index: EnumLookupIndex, query: string): ApiEnum | undefined {
  return index.byName.get(query.trim().toLowerCase()) ?? index.byName.get(normalizeQuery(query));
}

function wordPrefixScore(word: string, queryLower: string): number | null {
  const wordLower = word.toLowerCase();
  if (wordLower === queryLower) return 200;
  if (!wordLower.startsWith(queryLower) || queryLower.length < 3) return null;

  const remainder = word.slice(queryLower.length);
  if (remainder.length === 0) return 200;
  // Reject when the query continues into the same camelCase word (e.g. mode -> Model).
  if (remainder[0] === remainder[0].toLowerCase()) return null;

  const extra = wordLower.length - queryLower.length;
  if (extra === 1) return 110;
  return 90 - extra * 10;
}

function wordContainsScore(word: string, queryLower: string): number | null {
  const wordLower = word.toLowerCase();
  if (wordLower === queryLower) return 200;
  if (wordLower.includes(queryLower) && queryLower.length >= 4) return 80;
  return null;
}

export function scoreEnumMatch(enumName: string, query: string): { score: number; matchKind: EnumSuggestion["matchKind"] } | null {
  const queryNormalized = normalizeQuery(query);
  if (!queryNormalized) return null;

  const queryLower = query.trim().toLowerCase();
  const nameLower = enumName.toLowerCase();
  const nameNormalized = normalizeQuery(enumName);
  const words = enumWords(enumName);
  const queryTokens = significantQueryTokens(query);
  if (queryTokens.length === 0) return null;

  if (nameNormalized === queryNormalized || nameLower === queryLower) {
    return { score: 300, matchKind: "exact" };
  }

  if (queryTokens.length >= 2) {
    const matchedTokens = queryTokens.filter((token) =>
      words.some((word) => word.toLowerCase() === token || word.toLowerCase().startsWith(token)),
    );
    if (matchedTokens.length === queryTokens.length) {
      const firstWordBoost = words[0] && matchedTokens.includes(words[0].toLowerCase()) ? 20 : 0;
      const compactBoost = words.length <= 3 ? 15 : 0;
      return { score: 140 + matchedTokens.length * 25 + firstWordBoost + compactBoost, matchKind: "token" };
    }
    if (matchedTokens.length > 0) {
      return { score: 35 + matchedTokens.length * 12, matchKind: "token" };
    }
    return null;
  }

  const matchQuery = queryTokens.length === 1 ? queryTokens[0] : queryLower;

  let best: { score: number; matchKind: EnumSuggestion["matchKind"] } | null = null;
  const consider = (score: number, matchKind: EnumSuggestion["matchKind"], wordIndex: number) => {
    const firstWordBoost = wordIndex === 0 ? 25 : 0;
    const compactBoost = words.length <= 2 ? 15 : 0;
    const adjusted = score + firstWordBoost + compactBoost;
    if (!best || adjusted > best.score) best = { score: adjusted, matchKind };
  };

  for (let index = 0; index < words.length; index++) {
    const prefixScore = wordPrefixScore(words[index], matchQuery);
    if (prefixScore !== null) consider(prefixScore, "prefix", index);

    const containsScore = wordContainsScore(words[index], matchQuery);
    if (containsScore !== null) consider(containsScore, "contains", index);
  }

  if (best) return best;

  if (queryNormalized.length >= 5) {
    const maxDistance = queryNormalized.length >= 7 ? 2 : 1;
    const distance = levenshtein(queryNormalized, nameNormalized, maxDistance);
    if (distance !== null) {
      return { score: distance === 1 ? 50 : 30, matchKind: "near" };
    }
  }

  return null;
}

export function suggestEnums(index: EnumLookupIndex, query: string, limit = 8): EnumSuggestion[] {
  const scored = index.names
    .map((name) => {
      const result = scoreEnumMatch(name, query);
      return result ? { name, ...result } : null;
    })
    .filter((item): item is EnumSuggestion => item !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const topScore = scored[0]?.score ?? 0;
  const minScore =
    scored.length > 1 ? Math.min(topScore, Math.max(35, Math.floor(topScore * 0.55))) : 0;
  const seen = new Set<string>();
  const results: EnumSuggestion[] = [];
  for (const item of scored) {
    if (item.score < minScore) break;
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

export function formatEnumValues(enumInfo: ApiEnum): string {
  const name = enumInfo.Name ?? "Unknown";
  const items = [...(enumInfo.Items ?? [])].sort((a, b) => (a.Value ?? 0) - (b.Value ?? 0));
  const lines = [`ENUM: ${name}`, `Values (${items.length}):`, ""];
  for (const item of items) {
    lines.push(`  ${item.Name ?? "Unknown"} = ${item.Value ?? 0}`);
  }
  lines.push("", `DOCS: https://create.roblox.com/docs/reference/engine/enums/${encodeURIComponent(name)}`);
  return lines.join("\n");
}

export function formatEnumLookupResult(query: string, enumInfo: ApiEnum): string {
  return [`Exact enum match for "${query}":`, "", formatEnumValues(enumInfo)].join("\n");
}

export function formatEnumSuggestions(query: string, suggestions: EnumSuggestion[]): string {
  const lines = [`No exact enum match for "${query}".`, `Likely enum targets from local cache (${suggestions.length} shown):`, ""];
  suggestions.forEach((suggestion, index) => {
    lines.push(`${String(index + 1).padStart(2, " ")}. ${suggestion.name} (${suggestion.matchKind})`);
    lines.push(`    Next: roblox_get_enum({ enumName: "${suggestion.name}" })`);
  });
  return lines.join("\n");
}

export function formatEnumLookupMiss(query: string): string {
  return [
    `No Roblox enum match for "${query}".`,
    "No close enum names were found in the local docs cache.",
    "Try a shorter prefix, check spelling, or run roblox_search with broader keywords.",
    "Use roblox_get_enum when you already know the exact enum name.",
  ].join("\n");
}

// Helper module lives under /extensions for packaging convenience.
// Pi loads every file in that directory as a possible extension, so expose a
// no-op factory to avoid "does not export a valid factory function" errors.
export default function () {}
