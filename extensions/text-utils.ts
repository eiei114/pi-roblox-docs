export const MAX_OUTPUT_CHARS = 45_000;

export function firstSentence(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return compact.slice(0, maxChars - 1).trimEnd() + "…";
}

export function splitTokens(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

export function truncateOutput(text: string, maxChars = MAX_OUTPUT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars).trimEnd()}\n\n[Output truncated at ${maxChars.toLocaleString()} chars.]`,
    truncated: true,
  };
}

export function clampLimit(limit: unknown, defaultValue: number, maxValue: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return defaultValue;
  return Math.max(1, Math.min(maxValue, Math.floor(limit)));
}

// Helper module lives under /extensions for packaging convenience.
// Pi loads every file in that directory as a possible extension, so expose a
// no-op factory to avoid "does not export a valid factory function" errors.
export default function () {}
