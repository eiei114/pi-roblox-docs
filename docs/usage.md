# Usage

## Recommended workflow

1. Install `pi-roblox-docs` and start Pi.
2. Run `/roblox:sync` or `roblox_sync` with `force=false` on first use.
3. Check `/roblox:health` or `roblox_health` if lookups fail or feel stale.
4. Use search and lookup tools for Roblox APIs and Luau globals.
5. Use `roblox_search_devforum` or `/roblox:devforum` when Creator Docs and local cache are not enough.

## Data sources

Public sources used by the extension:

- [`MaximumADHD/Roblox-Client-Tracker`](https://github.com/MaximumADHD/Roblox-Client-Tracker) for `API-Dump.json`, `api-docs/en-us.json`, and `version.txt`
- Roblox Creator Docs links in tool output for reference

## Luau globals vs Roblox classes

Use `roblox_get_luau_global` for **Luau built-ins** (`math`, `string`, `coroutine`, `print`, `pcall`) and **Roblox globals/libraries** (`task`, `typeof`, `game`, `workspace`).

Use `roblox_search`, `roblox_get_class`, `roblox_get_member`, `roblox_get_enum`, and `roblox_lookup_enum` for **Roblox instance APIs** — classes like `Part`, services like `TweenService`, and enums like `EasingStyle`. Use `roblox_lookup_enum` before `roblox_get_enum` when the enum name might be misspelled or incomplete. Datatypes such as `Vector3` and `CFrame` stay on the class/member path, not Luau global lookup.

### Known confusion boundaries

Case-insensitive matching means a capitalized query like `Script` finds the `script` **global** (a reference to the current script's `LuaSourceContainer`), not the `Script` **class** (an Instance type). When the result looks different from what you expected, try `roblox_search` or `roblox_get_class` instead.

| Query | What happens | Right tool |
|---|---|---|
| `Script` | `roblox_get_luau_global` returns the `script` **global** (current script reference), not the `Script` **class** | `roblox_get_class({ className: "Script" })` |
| `Vector3` / `CFrame` / `Color3` | `roblox_get_luau_global` returns "not found" (datatypes are filtered out) | `roblox_search({ query: "Vector3" })` to find related API references, then `roblox_get_member` for member details |
| `Instance` | `roblox_get_luau_global` returns "not found" | `roblox_get_class({ className: "Instance" })` |

**Tip**: If `roblox_get_luau_global` returns an unexpected result or "not found", use `roblox_search({ query: "..." })` which searches classes, members, and enums in the local Roblox API index.

## Enum alias lookup

Use `roblox_lookup_enum` when the enum name is fuzzy, abbreviated, or misspelled. It returns an exact enum match when possible, otherwise bounded suggestions from the cached enum index, or an explicit no-match message.

**Tips for better results:**

- Prefer multi-word queries when you know part of the enum name (`humanoid state`, `render fidelity`, `easing style`).
- Very short or generic single-word queries (`type`, `state`, `mode`) may return several plausible enums; narrow the query or use `roblox_search` when you are exploring broadly.
- After `roblox_lookup_enum` identifies the exact enum name, call `roblox_get_enum` for the full value list.

## Cache

Cache location is OS-specific:

- Windows: `%LOCALAPPDATA%/pi-roblox-docs`
- macOS: `~/Library/Caches/pi-roblox-docs`
- Linux: `~/.cache/pi-roblox-docs`

The extension does not write large Roblox JSON files into your project or Obsidian vault.

`roblox_health` and `/roblox:health` report cache freshness using a **7-day stale threshold** based on `metadata.json` `lastSync`. Fresh caches stay compact; stale or missing caches include a short recommendation to run `roblox_sync`.

DevForum search results are cached for 1 hour in `devforum-cache.json` and are deleted by `roblox_clear_cache` and `/roblox:clear-cache`.

### Clearing cache

Use `roblox_clear_cache` or `/roblox:clear-cache` when local sync or index data looks corrupted, you suspect stale files after manual edits, or you want a clean re-download. The tool deletes only the package-owned `pi-roblox-docs` cache directory shown above. It does not delete project files, your Obsidian vault, or caches owned by other Pi packages.

After clearing, run `roblox_sync` before `roblox_search` and other API lookup tools work again. `roblox_health` reports missing cache files and `INDEX: not built (run roblox_sync first)` until you sync.

You usually do **not** need to clear cache for routine Roblox API version updates; `roblox_sync` skips the download when versions already match unless you pass `force=true`.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Search tools return no results | Cache not built yet | Run `/roblox:sync` or `roblox_sync` |
| Health reports stale cache | Last sync older than 7 days | Run `roblox_sync` |
| Enum lookup misses | Fuzzy or misspelled name | Try `roblox_lookup_enum` before `roblox_get_enum` |
| Corrupted or partial cache files | Interrupted sync or manual edits | Run `/roblox:clear-cache`, then sync again |
| DevForum results feel old | 1-hour DevForum cache | Wait, clear cache, or search again later |
