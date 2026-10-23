# Fork agent-kit for your team

agent-kit is a reference repo. Copy it, keep the parts you need, and point your projects at your own registry.

## Create your registry

1. Copy `examples/registry` into a new git repo.
2. Delete the example pieces you don't want, and remove their entries from `registry.json`.
3. Add a piece. Put its files in the folder for its type, then list its id, version, and description in `registry.json`.
4. Bump a piece's `version` in `registry.json` each time you change its files. The lockfile records the version and a content hash, so a forgotten bump still shows up as a hash change.
5. Push the repo and tag a release if you want projects to pin a ref.

Pieces in `mcp/` list environment variable names only. `agent-kit` rejects an MCP file whose `env` is an object, because an object can hold secret values.

## Point a project at it

```sh
agent-kit init --registry github:your-org/agent-registry#main --preset base
```

`agent-kit update` clones the registry into `~/.cache/agent-kit` and writes the commit it used to `agents.lock`. Set `AGENT_KIT_CACHE` to move the cache.

Commit `agents.json`, `agents.lock`, `AGENTS.md`, and the generated files. Run `agent-kit check` in CI.

## Add a target

1. Write `src/adapters/<target>.ts`. Export an `Adapter` with the piece types it supports and a `render` function. Skills are written to `.agents/skills/` for every target. If your target reads only its own skill directory, return a `link` file per skill, as `src/adapters/claude.ts` does. For a file that other tools also write, return owned entries instead of whole content.
2. Add the target to `TARGETS` in `src/types.ts` and to `ADAPTERS` in `src/adapters/index.ts`.
3. Add the format and its source to `docs/formats.md`.

`render` gets parsed pieces and returns file contents. It does no file I/O, so you can test it with plain objects.

## Add a piece type

1. Add the type to `PIECE_TYPES` and a variant to `PieceBody` in `src/types.ts`.
2. Parse it in `parseBody` in `src/registry.ts`.
3. Add the type to the `supports` set of each adapter that can write it, and render it there. `check` reports the type as unsupported for every other target.

## Know what each decision protects

[docs/decisions/](decisions/README.md) has one file per design decision. Each one says what you can change in your fork and what breaks if you change the decision itself. Read the matching file before you change the lockfile, `check`, an adapter, or the way agent-kit writes shared files.

## Rename the CLI

`agent-kit` is a working name. The name that users see is in two places:

- `package.json`: `name`, the `bin` key, and the `agent-kit` script.
- `README.md` and the docs.

The name also appears in places that existing projects depend on. Change them together, before any project uses your fork, or old projects stop matching:

- The `AGENTS.md` markers `<!-- agent-kit:start -->` and `<!-- agent-kit:end -->` (`START` and `END` in `src/project.ts`). A project generated with the old markers gets a second section.
- `.codex/rules/agent-kit.rules` in `src/adapters/codex.ts`. The old file stays until `update` deletes it as stale.
- The cache directory `~/.cache/agent-kit` and the `AGENT_KIT_CACHE` variable in `src/registry.ts`.
- Error messages and test expectations that say "agent-kit did not write it".

A plain replace works: `rg -l agent-kit | xargs sed -i 's/agent-kit/your-name/g'` (and `AGENT_KIT_` for the variable), (on macOS use `sed -i ''`), then `npm test` and `npm run smoke`, then regenerate `examples/project` with `update`.
