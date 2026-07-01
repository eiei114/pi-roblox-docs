# pi-roblox-docs

[![CI](https://github.com/eiei114/pi-roblox-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-roblox-docs/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-roblox-docs/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-roblox-docs/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-roblox-docs.svg)](https://www.npmjs.com/package/pi-roblox-docs)
[![npm downloads](https://img.shields.io/npm/dm/pi-roblox-docs.svg)](https://www.npmjs.com/package/pi-roblox-docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Pi-native Roblox API and Luau docs lookup from a local cache — no resident MCP server or background daemon.

## What this is

`pi-roblox-docs` registers Roblox documentation tools directly inside Pi's TypeScript extension runtime with `pi.registerTool()`.

- No MCP server, `uvx`, or background Node daemon
- Local cache from public Roblox API dumps for fast offline lookup
- Typed tools for classes, members, enums, Luau globals, and DevForum search
- Slash commands for sync, health, DevForum search, and cache maintenance

For maintenance direction and phased goals, see [`ROADMAP.md`](ROADMAP.md).

## Features

**Tools**

| Tool | Purpose |
|---|---|
| `roblox_sync` | Download or update the local Roblox API cache |
| `roblox_health` | Show cache/index status and freshness |
| `roblox_search` | Search classes, members, and enums |
| `roblox_get_class` | Show one class with grouped members |
| `roblox_get_member` | Show one class member |
| `roblox_get_enum` | Show enum values |
| `roblox_lookup_enum` | Resolve fuzzy enum names or near-miss aliases |
| `roblox_get_luau_global` | Look up Luau built-ins and Roblox globals/libraries |
| `roblox_search_devforum` | Search Roblox Developer Forum discussions |
| `roblox_clear_cache` | Delete the package-owned local cache |

**Commands**

| Command | Purpose |
|---|---|
| `/roblox:sync` | Sync local Roblox docs cache |
| `/roblox:sync --force` | Redownload even when versions match |
| `/roblox:health` | Show cache/index status and freshness |
| `/roblox:devforum <query>` | Search DevForum discussions |
| `/roblox:clear-cache` | Delete local cache after confirmation |

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
git clone https://github.com/eiei114/pi-roblox-docs.git
cd pi-roblox-docs
npm ci
pi -e ./extensions/roblox-docs.ts
```

## Quick start

1. Install the package (see above).
2. Sync the local cache:

   ```text
   /roblox:sync
   ```

   or call `roblox_sync` with `force=false`.
3. Ask Roblox API questions in Pi, for example:

   - "How do I use TweenService?"
   - "What enum values does EasingStyle have?"
   - "What does `task.wait` do?"

## Usage summary

After the first sync, use `roblox_search`, `roblox_get_class`, `roblox_get_member`, `roblox_get_enum`, and `roblox_lookup_enum` for Roblox instance APIs. Use `roblox_get_luau_global` for Luau built-ins and Roblox globals such as `math`, `task`, and `typeof`.

`roblox_health` and `/roblox:health` report cache freshness with a **7-day stale threshold**. Run `roblox_sync` when the cache is stale or missing.

For detailed workflows, cache policy, Luau-vs-class guidance, and tool examples, see:

- [`docs/usage.md`](docs/usage.md)
- [`docs/examples.md`](docs/examples.md)

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoint and helper modules |
| `docs/` | Optional supporting docs (usage, examples, release) |
| `README.md` | GitHub/npm entrypoint |
| `LICENSE` | MIT license |
| `CHANGELOG.md` | Release history |
| `SECURITY.md` | Vulnerability reporting |
| `ROADMAP.md` | Maintenance direction and phased goals |

## Development

```bash
npm ci
npm run check
```

## Release

This package is configured for npm Trusted Publishing. No `NPM_TOKEN` is stored in the repo.

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md) for Trusted Publishing setup and workflow details.

## Docs

`docs/` is optional supporting documentation, not a fixed template doc set. README stays the GitHub/npm entrypoint.

- [`docs/usage.md`](docs/usage.md) — cache policy, data sources, Luau vs class lookup, troubleshooting
- [`docs/examples.md`](docs/examples.md) — tool and command examples
- [`docs/release.md`](docs/release.md) — Trusted Publishing and release workflow

## Security

Pi packages can execute code with your local permissions. This extension downloads public Roblox API dumps, may query the Roblox Developer Forum, and writes cache files under an OS-specific package-owned directory. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-roblox-docs
- GitHub: https://github.com/eiei114/pi-roblox-docs
- Issues: https://github.com/eiei114/pi-roblox-docs/issues
- Pi packages: https://pi.dev/packages
- Data source: https://github.com/MaximumADHD/Roblox-Client-Tracker

## License

MIT
