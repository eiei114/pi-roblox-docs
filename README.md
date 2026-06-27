# pi-roblox-docs

[![CI](https://github.com/eiei114/pi-roblox-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-roblox-docs/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-roblox-docs/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-roblox-docs/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-roblox-docs.svg)](https://www.npmjs.com/package/pi-roblox-docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Pi native Roblox documentation tools.

This package does **not** start an MCP server, `uvx`, or a background Node daemon. It runs inside Pi's TypeScript extension runtime and registers Roblox documentation tools directly with `pi.registerTool()`.

For maintenance direction, phased goals, and the `pi-extension-template` compliance checklist, see [`ROADMAP.md`](ROADMAP.md).

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

From npm:

```bash
pi install npm:pi-roblox-docs
```

From GitHub:

```bash
pi install git:github.com/eiei114/pi-roblox-docs
```

Local development:

```bash
pi -e ./extensions/roblox-docs.ts
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

DevForum search results are cached for 1 hour in `devforum-cache.json` and are deleted by `roblox_clear_cache` and `/roblox:clear-cache`.

### Clearing cache

Use `roblox_clear_cache` or `/roblox:clear-cache` when local sync or index data looks corrupted, you suspect stale files after manual edits, or you want a clean re-download. The tool deletes only the package-owned `pi-roblox-docs` cache directory shown above. It does not delete project files, your Obsidian vault, or caches owned by other Pi packages.

After clearing, run `roblox_sync` before `roblox_search` and other API lookup tools work again. `roblox_health` reports missing cache files and `INDEX: not built (run roblox_sync first)` until you sync.

You usually do **not** need to clear cache for routine Roblox API version updates; `roblox_sync` skips the download when versions already match unless you pass `force=true`.

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Release

Version history and release notes are in [`CHANGELOG.md`](CHANGELOG.md). Roadmap and maintenance direction are in [`ROADMAP.md`](ROADMAP.md).

