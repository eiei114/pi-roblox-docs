# Examples

## Extension

`extensions/roblox-docs.ts` registers the Roblox docs tools and slash commands.

Try it locally:

```bash
npm ci
pi -e ./extensions/roblox-docs.ts
```

## Sync and health

```text
/roblox:sync
/roblox:health
```

Tool equivalents:

```text
roblox_sync({ force: false })
roblox_health()
```

Force a redownload:

```text
/roblox:sync --force
```

```text
roblox_sync({ force: true })
```

## Roblox API lookup

After syncing, ask natural-language questions in Pi or call tools directly:

```text
roblox_search({ query: "TweenService" })
roblox_get_class({ className: "TweenService" })
roblox_get_member({ className: "TweenService", memberName: "Create" })
roblox_get_enum({ enumName: "EasingStyle" })
```

Natural-language prompts that work well:

- "How do I use TweenService?"
- "Is BodyPosition deprecated?"
- "What enum values does EasingStyle have?"
- "Find APIs for player character spawning."

## Enum alias lookup

Local cache only — no web search:

```text
roblox_lookup_enum({ query: "easing style" })
roblox_lookup_enum({ query: "Materail" })
```

Use `roblox_lookup_enum` when the enum name is fuzzy, abbreviated, or misspelled.

## Luau globals

```text
roblox_get_luau_global({ name: "task.wait" })
roblox_get_luau_global({ name: "math.clamp" })
roblox_get_luau_global({ name: "table.insert" })
roblox_get_luau_global({ name: "script" })
roblox_get_luau_global({ name: "string.split" })
```

Example prompts:

- "What does `task.wait` do?"
- "How do I use `math.clamp`?"
- "What are the overloads for `table.insert`?"
- "What does the `script` global refer to?"
- "How do I split a string?"

### What not to use Luau globals for

Lookups for **Roblox instance classes** (`Part`, `Script`, `Player`), **services** (`TweenService`, `DataStoreService`), and **datatypes** (`Vector3`, `CFrame`, `Color3`) return miss results. Use `roblox_search` or `roblox_get_class` for those instead.

## DevForum search

```text
/roblox:devforum TweenService best practices
```

```text
roblox_search_devforum({ query: "TweenService best practices" })
```

## Cache maintenance

```text
/roblox:clear-cache
```

```text
roblox_clear_cache()
```

After clearing, run `roblox_sync` before search and lookup tools work again.
