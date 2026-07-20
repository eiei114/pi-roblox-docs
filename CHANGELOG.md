# Changelog

## Unreleased

### Changed

- Bump package version to `0.3.9` for the next patch release.

- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.7] - 2026-07-03

### Fixed

- Tighten `roblox_lookup_enum` suggestion ranking after dogfood: camelCase word-boundary matching, multi-word token boosts, stop-word filtering, and relative score cutoffs to reduce noisy cross-enum suggestions.
- Reject `mode`-style false prefixes inside longer words such as `ModelLevelOfDetail`.

### Changed

- Document enum lookup tips for multi-word queries and when to fall back to `roblox_search` for generic short queries.

## [0.3.6] - 2026-07-02

### Fixed

- Sort Luau global overload signatures for stable CLI output.
- Correct docs guidance for datatype vs class lookup paths (`Vector3`/`Instance`).

## [0.3.5] - 2026-07-02

### Fixed

- Display Luau global overload signatures, including `table.insert`, instead of returning empty output for overload-only entries.
- Document Luau global lookup confusion boundaries for case-insensitive `script`/`Script`, datatypes, and Roblox classes.

## [0.3.4] - 2026-07-01

### Fixed

- Corrected Roblox tool argument names in `docs/examples.md` (`className`, `memberName`, `enumName`).
- Aligned README Package contents table with the npm `files` list (`LICENSE` added, source-only `tests/` removed).

## [0.3.3] - 2026-07-01

### Changed

- Aligned README with the Pi OSS minimal-docs policy: required badges, entrypoint sections, and concise usage summary.
- Added purposeful supporting docs under `docs/` (`usage.md`, `examples.md`, `release.md`) and linked them from README.
- Packaged `docs/` in the npm tarball via `package.json` `files`.

## [0.3.2] - 2026-06-29

### Fixed

- Extended the helper-module audit across managed Pi OSS packages and fixed the remaining `enum-aliases` helper so Pi no longer treats it as an invalid extension candidate.
- Added the tracked `extensions/enum-aliases.js` default re-export so packaged installs can resolve `./enum-aliases.js` consistently.

## [0.3.1] - 2026-06-29

### Fixed

- Prevented Pi from rejecting helper modules in `extensions/` by giving `cache-freshness` and `luau-globals` no-op default extension factories.
- Added tracked `.js` helper entrypoints so runtime imports like `./cache-freshness.js` and `./luau-globals.js` resolve cleanly in packaged installs.

## [0.3.0] - 2026-06-29

### Added

- `roblox_lookup_enum` tool for resolving fuzzy enum names, aliases, and near-miss spellings from the local docs cache.
- `extensions/enum-aliases.ts` with deterministic enum suggestion scoring and explicit no-match messaging.
- `tests/enum-alias.test.mjs` covering exact match, alias/near-miss suggestions, and no-match behavior.
- README enum alias lookup examples and guidance on when to use `roblox_lookup_enum` vs `roblox_get_enum`.

## [0.2.0] - 2026-06-28

### Added

- `roblox_clear_cache` maintenance tool output now states that `roblox_sync` is required before search and API lookups work again.
- Exported cache helpers (`clearRobloxCache`, `formatClearCacheMessage`, `inspectCacheHealth`) for behavioral tests.
- `tests/clear-cache.test.mjs` covers clear-after-sync and clear-when-empty flows, including post-clear health state.
- README documents cache-clear use cases, package-owned boundaries, and when clearing is unnecessary.

### Changed

- `/roblox:clear-cache` confirmation flow uses the same sync-required guidance as the tool.

## [0.1.7] - 2026-06-28

### Added

- `roblox_health` and `/roblox:health` now report last sync age, cache freshness (`fresh` / `stale` / `not synced`), and a concise `roblox_sync` recommendation when the cache is stale or missing.
- `extensions/cache-freshness.ts` with a documented 7-day stale threshold and tests for fresh, stale, and never-synced states.
- README cache policy describing the stale threshold and how to respond to warnings.

## [0.1.6] - 2026-06-27

### Added

- `roblox_get_luau_global` tool for looking up documented Luau built-ins and Roblox globals/libraries (for example `math`, `task`, `typeof`) from the local docs cache.
- Luau globals adapter (`extensions/luau-globals.ts`) with bounded suggestion help for close misses.
- Tests covering exact Luau global lookup and missing-name suggestions.
- README guidance on when to use Luau global lookup vs class/member/enum lookup.

## [0.1.5] - 2026-06-24

### Added

- `ROADMAP.md` defining maintenance-first phased goals (Month 1–3), doc-access feature priorities, Roblox API coverage mapping, caching strategy, the `pi-extension-template` compliance checklist, and backlog integration.
- README now links to `ROADMAP.md` (intro + Release section).
- `ROADMAP.md` shipped in the npm tarball via `package.json` `files`.

## [0.1.4] - 2026-06-07

### Added

- `SECURITY.md` with vulnerability reporting instructions and supported-version policy.
- README Security and Release sections linking to `SECURITY.md` and `CHANGELOG.md`.
- Packaged `SECURITY.md` and `CHANGELOG.md` in the npm tarball via `package.json` `files`.

### Changed

- Seeded earlier release history (`0.1.0`, `0.1.1`) in Keep a Changelog format.

## [0.1.3] - 2026-06-06

### Fixed

- Aligned CI workflows with pi-extension-template pattern for reliable auto-release → publish handoff.
- `auto-release.yml`: removed `paths: [package.json]` filter and complex before/after diff logic; now uses simple "tag exists?" check like the template.
- `auto-release.yml`: downgraded `actions/checkout@v6` → `@v4` (v6 does not exist, caused workflow failure).
- `publish.yml`: downgraded `actions/checkout@v6` / `actions/setup-node@v6` → `@v4`; fixed concurrency key to include `inputs.ref`.
- `ci.yml`: added `version:check` step on PRs and full `npm run check` validation.
- Added `version:check` script to `package.json`.

## [0.1.2] - 2026-06-06

### Changed

- Added `version:check` PR guard support: package script + `scripts/check-version-bump.mjs`.
- Updated auto-release.yml to actions@v6 and publish.yml to setup-node@v6 for consistency.
- Bumped package version to 0.1.2 to trigger auto-release publish (0.1.2 CHANGELOG existed but package.json was 0.1.1).
- Added CI verification that publishable changes must bump `package.json` and update `CHANGELOG.md` in the same PR.

## [0.1.1] - 2026-05-29

### Added

- npm and GitHub install instructions in README.

## [0.1.0] - 2026-05-29

### Added

- Initial Pi native Roblox documentation extension with sync, search, and DevForum tools.

