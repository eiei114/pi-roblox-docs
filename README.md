# pi-roblox-docs

Pi native Roblox documentation tools.

This package does **not** start an MCP server, `uvx`, or a background Node daemon. It runs inside Pi's TypeScript extension runtime and registers Roblox documentation tools directly with `pi.registerTool()`.

## Tools

MVP tools:

- `roblox_sync` - download/update local Roblox API cache
- `roblox_health` - show cache/index status
- `roblox_search` - search classes, members, and enums
- `roblox_get_class` - show one class with grouped members
- `roblox_get_member` - show one class member
- `roblox_get_enum` - show enum values
- `roblox_search_devforum` - search Roblox Developer Forum discussions
- `roblox_clear_cache` - delete local cache

## Slash commands

- `/roblox:sync` - sync local Roblox docs cache
- `/roblox:sync --force` - redownload even when versions match
- `/roblox:health` - show cache/index status
- `/roblox:devforum <query>` - search DevForum discussions
- `/roblox:clear-cache` - delete local cache after confirmation

## Data sources

Public sources used by the extension:

- `MaximumADHD/Roblox-Client-Tracker` for `API-Dump.json`, `api-docs/en-us.json`, and `version.txt`
- Roblox Creator Docs links for output references

## Install

Local development:

```bash
pi -e ./extensions/roblox-docs.ts
```

As a Pi package from this directory:

```bash
pi install ./path/to/pi-roblox-docs
```

From GitHub:

```bash
pi install git:github.com/eiei114/pi-roblox-docs
```

## Development

```bash
npm ci
npm run check
```

## Usage

First sync data:

```text
Call roblox_sync with force=false
```

Then ask Roblox API questions. Examples:

- "How do I use TweenService?"
- "Is BodyPosition deprecated?"
- "What enum values does EasingStyle have?"
- "Find APIs for player character spawning."

## Cache

Cache location is OS-specific:

- Windows: `%LOCALAPPDATA%/pi-roblox-docs`
- macOS: `~/Library/Caches/pi-roblox-docs`
- Linux: `~/.cache/pi-roblox-docs`

The extension does not write large Roblox JSON files into your project or Obsidian vault.

DevForum search results are cached for 1 hour in `devforum-cache.json` and are deleted by `/roblox:clear-cache`.

