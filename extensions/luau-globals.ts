export interface LuauGlobalDocEntry {
  documentation?: string;
  keys?: Record<string, string>;
  params?: Array<{ name?: string }>;
  returns?: string[];
  learn_more_link?: string;
}

export interface LuauGlobalItem {
  name: string;
  docKey: string;
  entry: LuauGlobalDocEntry;
  source: "luau" | "roblox";
}

export interface LuauGlobalsIndex {
  byName: Map<string, LuauGlobalItem>;
  names: string[];
}

export function isLuauGlobalDocKey(key: string, entry: unknown): boolean {
  if (key.includes("/param/") || key.includes("/return/")) return false;
  if (typeof entry !== "object" || entry === null) return false;

  if (key.startsWith("@luau/global/")) return true;

  if (key.startsWith("@roblox/global/")) {
    const link = (entry as LuauGlobalDocEntry).learn_more_link ?? "";
    return link.includes("/globals/") || link.includes("/libraries/");
  }

  return false;
}

export function docKeyToGlobalName(key: string): string {
  if (key.startsWith("@luau/global/")) return key.slice("@luau/global/".length);
  if (key.startsWith("@roblox/global/")) return key.slice("@roblox/global/".length);
  return key;
}

export function buildLuauGlobalsIndex(docs: Record<string, unknown>): LuauGlobalsIndex {
  const byName = new Map<string, LuauGlobalItem>();
  const names: string[] = [];

  for (const [key, value] of Object.entries(docs)) {
    if (!isLuauGlobalDocKey(key, value)) continue;

    const entry = value as LuauGlobalDocEntry;
    const name = docKeyToGlobalName(key);
    const normalized = name.toLowerCase();
    if (byName.has(normalized)) continue;

    const item: LuauGlobalItem = {
      name,
      docKey: key,
      entry,
      source: key.startsWith("@luau/global/") ? "luau" : "roblox",
    };
    byName.set(normalized, item);
    names.push(name);
  }

  names.sort((a, b) => a.localeCompare(b));
  return { byName, names };
}

export function lookupLuauGlobal(index: LuauGlobalsIndex, name: string): LuauGlobalItem | undefined {
  return index.byName.get(name.trim().toLowerCase());
}

export function suggestLuauGlobals(index: LuauGlobalsIndex, query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = index.names
    .map((name) => {
      const lower = name.toLowerCase();
      let score = 0;
      if (lower === q) score += 300;
      else if (lower.startsWith(q)) score += 120;
      else if (lower.includes(q)) score += 80;
      else if (name.split(".").some((part) => part.toLowerCase().startsWith(q))) score += 60;
      else if (name.split(".").some((part) => part.toLowerCase().includes(q))) score += 30;
      return { name, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scored.slice(0, limit).map((item) => item.name);
}

export function firstSentence(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return compact.slice(0, maxChars - 1).trimEnd() + "…";
}

export function formatLuauGlobal(item: LuauGlobalItem, options: { memberLimit?: number } = {}): string {
  const memberLimit = Math.max(1, Math.min(200, options.memberLimit ?? 40));
  const { name, entry, source } = item;
  const label = source === "luau" ? "LUAU GLOBAL" : "ROBLOX GLOBAL";
  const lines = [`${label}: ${name}`];

  if (entry.keys && typeof entry.keys === "object") {
    const members = Object.keys(entry.keys).sort();
    if (entry.documentation) {
      lines.push("", "DESCRIPTION:", firstSentence(entry.documentation, 1200));
    }
    lines.push("", `MEMBERS (${members.length}):`);
    const shown = members.slice(0, memberLimit);
    lines.push(`  ${shown.join(", ")}`);
    if (members.length > shown.length) {
      lines.push(`  ... ${members.length - shown.length} more. Increase memberLimit for more.`);
    }
  } else {
    const params = (entry.params ?? []).map((param) => param.name ?? "arg").join(", ");
    if ((entry.params ?? []).length > 0) {
      const returnHint = (entry.returns ?? []).length > 0 ? " -> ..." : "";
      lines.push(`Signature: ${name}(${params})${returnHint}`);
    }
    if (entry.documentation) {
      lines.push("", "DESCRIPTION:", firstSentence(entry.documentation, 1600));
    }
  }

  if (entry.learn_more_link) {
    lines.push("", `DOCS: ${entry.learn_more_link}`);
  }

  return lines.join("\n");
}

export function formatLuauGlobalMiss(query: string, suggestions: string[]): string {
  const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
  return `Luau global "${query}" not found.${suggestionText}\nUse roblox_get_class / roblox_get_member / roblox_get_enum for Roblox classes, members, and enums.`;
}
