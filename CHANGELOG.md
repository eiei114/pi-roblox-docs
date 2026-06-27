# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
