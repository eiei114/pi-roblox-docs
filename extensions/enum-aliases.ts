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

function splitTokens(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
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

export function scoreEnumMatch(enumName: string, query: string): { score: number; matchKind: EnumSuggestion["matchKind"] } | null {
  const queryNormalized = normalizeQuery(query);
  if (!queryNormalized) return null;

  const nameLower = enumName.toLowerCase();
  const nameNormalized = normalizeQuery(enumName);

  if (nameNormalized === queryNormalized || nameLower === query.trim().toLowerCase()) {
    return { score: 300, matchKind: "exact" };
  }
  if (nameNormalized.startsWith(queryNormalized) || nameLower.startsWith(query.trim().toLowerCase())) {
    return { score: 120, matchKind: "prefix" };
  }
  if (nameNormalized.includes(queryNormalized) || nameLower.includes(query.trim().toLowerCase())) {
    return { score: 80, matchKind: "contains" };
  }

  const queryTokens = splitTokens(query);
  const nameTokens = splitTokens(enumName);
  if (queryTokens.length > 0) {
    const matchedTokens = queryTokens.filter((token) => nameTokens.some((nameToken) => nameToken.startsWith(token) || nameToken.includes(token)));
    if (matchedTokens.length === queryTokens.length) {
      return { score: 60 + matchedTokens.length * 10, matchKind: "token" };
    }
    if (matchedTokens.length > 0) {
      return { score: 30 + matchedTokens.length * 8, matchKind: "token" };
    }
  }

  if (queryNormalized.length >= 4) {
    const distance = levenshtein(queryNormalized, nameNormalized, 2);
    if (distance !== null) {
      return { score: distance === 1 ? 50 : 25, matchKind: "near" };
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

  const seen = new Set<string>();
  const results: EnumSuggestion[] = [];
  for (const item of scored) {
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
