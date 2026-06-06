# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [prior releases]

See git history and GitHub releases for earlier changes.
