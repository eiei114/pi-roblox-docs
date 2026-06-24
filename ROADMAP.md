# Roadmap

This roadmap governs maintenance of **pi-roblox-docs** — a Pi-native extension
that registers Roblox documentation tools directly via `pi.registerTool()`
(no MCP server, `uvx`, or background daemon).

> **Direction source:** `oss-maintenance-roadmap-direction-v1`
> This is a **maintenance-first** project. We prioritize hardening the existing
> surface over expanding it.

## Guiding principles

1. **Stabilization before expansion.** Existing tools, slash commands, and UX
   stay unchanged except for necessary compatibility fixes.
2. **Speed & token efficiency.** Startup latency, sync cost, and output size are
   first-class metrics.
3. **Explicit design boundaries.** Keep the cache layer, data layer, search
   layer, and tool layer separable and documented.
4. **`pi-extension-template` compliance.** Track and close gaps against the
   upstream template.
5. **Public quality.** README, CHANGELOG, SECURITY, CI, `npm pack`, and release
   handoff must stay publishable and trustworthy.

### Operating constraints

- **Human-owned actions** (unchanged by any AI task): repository secrets, npm
  publishing credentials, permission changes, production actions. AI tasks only
  prepare and verify; humans gate the release boundary.
- **Seed sizing.** Every actionable item below is intended as a 30–90 minute,
  independently verifiable change with an explicit version-bump classification.

## Change classification (SemVer for this package)

| Bump | Applies to |
| --- | --- |
| `patch` | bug fixes, CI/template compliance, doc/README alignment, non-behavioral refactors |
| `minor` | backward-compatible improvements: search-quality, perf/token-efficiency, new optional config, additional cached metadata |
| `major` | breaking changes to a tool name, slash command, output shape, or cache location — **avoid unless required**; always human-approved |

---

## Phase 1 — Month 1: Stabilization & public quality

**Goal:** make the current surface fully self-consistent and publishable with
no known compliance gaps.

| # | Item | Type | Bump | Acceptance |
| --- | --- | --- | --- | --- |
| 1.1 | Pin **all** GitHub Actions to immutable SHAs. `ci.yml` is already pinned; `auto-release.yml` and `publish.yml` still float on `actions/checkout@v4` / `actions/setup-node@v4`. | compliance | patch | `grep -R "uses: actions/" .github` shows only SHA-pinned refs; smoke test extended to assert no floating `@v*`. |
| 1.2 | Close `pi-extension-template` compliance checklist (see section below); record any intentional deviations in this file. | compliance | patch | Checklist section updated with status + rationale. |
| 1.3 | README alignment: verify every documented tool and slash command matches registered names (`roblox_sync`, `roblox_health`, `roblox_search`, `roblox_get_class`, `roblox_get_member`, `roblox_get_enum`, `roblox_search_devforum`, `roblox_clear_cache`; `/roblox:sync`, `/roblox:health`, `/roblox:devforum`, `/roblox:clear-cache`). | docs | patch | A smoke test asserts README tool/command tokens match `pi.registerTool` / `pi.registerCommand` names. (Carries the standing **README alignment** backlog task.) |
| 1.4 | `npm pack` contents audit: confirm `files` ships exactly `README.md`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, and `extensions/` — no stray sources, no missing docs. | quality | patch | `npm run pack:dry` output captured as the expected manifest; drift breaks CI. |
| 1.5 | Error-path review: every tool returns a stable, user-readable message when the cache is not synced (today: `notSyncedMessage()`). Standardize wording across tools. | stabilization | patch | All 8 tools emit the same not-synced guidance; snapshot test covers it. |

## Phase 2 — Month 2: Performance, token efficiency & design boundaries

**Goal:** reduce latency and output cost without changing the user-facing contract.

| # | Item | Type | Bump | Acceptance |
| --- | --- | --- | --- | --- |
| 2.1 | Token-efficiency pass on tool output. Profile `truncateOutput()` / `firstSentence()` budgets (`MAX_OUTPUT_CHARS`) and trim redundant fields in `roblox_search` / `roblox_get_class` results. | perf | minor | Representative queries return measurably shorter output; behavioral tests pin the new shape. |
| 2.2 | Cold-start audit: measure extension load + lazy `loadData()` cost; defer all file reads until first tool call. | perf | minor | A startup benchmark is added to the repo; load path does no I/O at registration time. |
| 2.3 | Document design boundaries (cache ↔ data ↔ search ↔ tool) in an `ARCHITECTURE.md` section or inline module headers. | design | patch | Each layer's responsibility is written down; refactor optional and UX-neutral. |
| 2.4 | Search scoring review (`scoreSearchItem`): confirm ranking matches user intent for common queries (deprecated members, enums, inheritance). No contract change. | quality | minor | A corpus of query→expected-top-hit cases is added as tests. |

## Phase 3 — Month 3: API coverage & caching maturity

**Goal:** make coverage measurable and the cache predictable.

| # | Item | Type | Bump | Acceptance |
| --- | --- | --- | --- | --- |
| 3.1 | Roblox API coverage map: generate a coverage report from `API-Dump.json` (class count, member count, enum count) vs. what the search index exposes. | coverage | minor | A `scripts/coverage-report.mjs` prints class/member/enum totals; numbers recorded here. |
| 3.2 | Caching strategy doc: codify OS cache locations, version-driven invalidation (`remoteVersion` vs cached), `--force` redownload, and the 1-hour DevForum TTL. | design | patch | Cache section below is the source of truth and matches code. |
| 3.3 | Stale-cache resilience: define behavior when upstream `version.txt` is unreachable (reuse cache, surface a clear warning). | stabilization | minor | Offline/upstream-failure path tested; no crash, cache reused. |
| 3.4 | Multi-language readiness: `DEFAULT_LANGUAGE` is central, but only one language path is exercised. Document the contract and add a guard test. | coverage | minor | Language switch is documented; invalid language falls back deterministically. |

---

## Doc-access feature priorities

The existing doc-access surface (built, not to be expanded here) is:

1. **Search first** — `roblox_search` is the primary entry point; keep it fast and
   high-precision. Refinements are ranking/length only (Phase 2.1, 2.4).
2. **Targeted fetch** — `roblox_get_class` / `roblox_get_member` / `roblox_get_enum`
   retrieve a single focused object; preserve their grouped, truncated output.
3. **Live context** — `roblox_search_devforum` adds community discussion; keep the
   1-hour cache and the clear "cached vs fresh" signal.
4. **Cache hygiene** — `roblox_sync` / `roblox_health` / `roblox_clear_cache` keep
   the local index correct and inspectable.

> **Not on this roadmap:** new tools, new slash commands, or a background server.
> New features require a separate, human-approved feature issue.

## Roblox API coverage mapping

| Layer | Source | Status |
| --- | --- | --- |
| Class catalog + members | `MaximumADHD/Roblox-Client-Tracker` → `API-Dump.json` | Indexed; exposed via search + get_class/member |
| Member documentation | same tracker → `api-docs/en-us.json` | Joined into `buildDocsMap()` |
| Enums | `API-Dump.json` enums section | Exposed via `roblox_get_enum` |
| Version freshness | `version.txt` from the tracker | Drives sync skip/force logic |
| Community context | Roblox DevForum search | 1-hour TTL cache |

Phase 3.1 turns the above into measured numbers (class/member/enum totals and
index hit-rate) so coverage is observable rather than anecdotal.

## Caching strategy for API docs

- **Location (OS-conventional):** Windows `%LOCALAPPDATA%/pi-roblox-docs`,
  macOS `~/Library/Caches/pi-roblox-docs`, Linux `~/.cache/pi-roblox-docs`.
  The extension never writes Roblox JSON into the user's project or vault.
- **Invalidation:** version-driven. On sync, the remote `version.txt` is compared
  to the cached version; matching versions skip the download unless `force=true`.
- **DevForum cache:** separate `devforum-cache.json`, 1-hour TTL, cleared by
  `/roblox:clear-cache`.
- **Resilience (Phase 3.3):** when upstream is unreachable, reuse the existing
  cache and surface a warning rather than failing.

---

## `pi-extension-template` compliance checklist

Current status as of v0.1.4. Deviations are tracked here so they are intentional.

| Item | Status | Note |
| --- | --- | --- |
| `pi.extensions` declared in `package.json` | ✅ done | `["./extensions"]` |
| `pi-package` keyword for discoverability | ✅ done | — |
| `publishConfig.access = "public"` | ✅ done | — |
| `npm run check` (typecheck + test + pack:dry) | ✅ done | — |
| `version:check` PR guard | ✅ done | `scripts/check-version-bump.mjs` |
| CI validates PRs + `main` | ✅ done | `.github/workflows/ci.yml` |
| Auto-release → publish handoff | ✅ done | `auto-release.yml` → `publish.yml` |
| npm provenance (`id-token: write`) | ✅ done | `publish.yml` |
| Keep a Changelog + SemVer | ✅ done | `CHANGELOG.md` |
| `SECURITY.md` + reporting policy | ✅ done | — |
| **GitHub Actions pinned to immutable SHAs** | ⚠️ partial | `ci.yml` pinned; `auto-release.yml`/`publish.yml` still float `@v4` → Phase 1.1 |
| README ↔ registered tools/commands drift guard | ⚠️ gap | to add in Phase 1.3 |
| `npm pack` manifest drift guard | ⚠️ gap | to add in Phase 1.4 |

## Backlog integration

The standing **README alignment** backlog task is folded into Phase 1.3 (with a
smoke test, so it cannot regress). Any future backlog item must be mapped to a
phase here — or explicitly deferred — before it is worked, so this file remains
the single source of intent.

---

This roadmap is a living document. Update it (and bump `CHANGELOG.md`) whenever a
phase item is completed, a compliance status changes, or direction shifts.
