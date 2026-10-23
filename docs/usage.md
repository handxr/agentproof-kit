# How agentproof-kit works

This page covers the project files, the registry layout, presets, global installs, the code layout and the tests. [The CLI reference](cli.md) covers commands and output.

## Sync and update

`sync` and `check` load the registry at the commit in `agents.lock`. If the registry content at that commit no longer matches a piece's hash, both commands fail and tell you to run `update`. Run `sync` after a pull, and `update` when you want new pieces.

## The project files

`agents.json` is the file you edit:

```json
{
  "registry": "github:your-org/agent-registry#main",
  "presets": ["frontend"],
  "add": { "commands": ["ship"] },
  "remove": { "hooks": ["format-on-edit"] },
  "targets": ["cursor", "claude", "codex"]
}
```

`registry` is a path relative to the project, `github:<org>/<repo>#<ref>`, or `git:<url>#<ref>`. agentproof-kit clones git registries into `~/.cache/agentproof-kit`.

agentproof-kit resolves presets first, parents before children. It then adds `add` and drops `remove`.

`agents.lock` records the registry commit, each piece's version and content hash, and the hash of every file agentproof-kit writes whole. `update` deletes files that the old lock listed and the new one does not.

Some files are shared with the user: `.mcp.json`, `.cursor/mcp.json`, `.cursor/hooks.json`, `.cursor/cli.json`, `.claude/settings.json`, `.codex/hooks.json`, and `.codex/config.toml`. In these, agentproof-kit manages only its own entries, such as one MCP server or one permission rule, and records them under `owned` in `agents.lock`. Entries you add by hand stay. An entry of yours with the same name as one agentproof-kit wants to write stops `update` with an error that names it.

`AGENTS.md` gets a section between `<!-- agentproof-kit:start -->` and `<!-- agentproof-kit:end -->`. agentproof-kit replaces only that section. Rules for every target live there. Codex and Cursor read `AGENTS.md` directly. For Claude Code, agentproof-kit makes sure `CLAUDE.md` has a line `@AGENTS.md` and leaves the rest of that file alone.

Skills are written once, to `.agents/skills/<id>/`. When `claude` is a target, `.claude/skills/<id>` is a symlink to that copy, because Claude Code reads only `.claude/skills/`. Your own skills in `.claude/skills/` stay.

Commit `agents.json`, `agents.lock`, `AGENTS.md`, and the generated files. Then a teammate gets the setup from `git pull`, and CI can run `check`. Git must keep symlinks (the default on macOS and Linux) for the `.claude/skills/` links.

To try it on your machine with the agent CLIs you already use, run `bash scripts/try-local.sh`. See [Checked against the real CLIs](formats.md#checked-against-the-real-clis).

## The registry

```
registry.json                 index of pieces and presets, with versions
skills/<id>/SKILL.md          plus any supporting files in the folder
mcp/<id>.json                 {"command", "args", "env": [NAMES]} or {"url", "bearerTokenEnv"}
rules/<id>.md                 frontmatter: description, globs, alwaysApply
commands/<id>.md
agents/<id>.md                frontmatter: name, description, model, readonly
hooks/<id>.json               {"event": "preShell" | "postEdit", "script": "<file>"}
hooks/<script>
permissions/<id>.json         {"allow": [...], "ask": [...], "deny": [...]} shell command prefixes
presets/<id>.json             {"extends": [...], "skills": [...], "mcp": [...], ...}
```

MCP files list environment variable names, never values. agentproof-kit writes each target's own reference syntax, such as `${env:NAME}` for Cursor and `${NAME}` for Claude Code.

## Presets

A preset is a named list of pieces. A preset can `extend` others, so a team keeps one `base` and builds on it:

```jsonc
// presets/base.json
{ "skills": ["code-review"], "mcp": ["github"], "rules": ["conventional-commits"], "hooks": ["block-force-push"] }

// presets/frontend.json
{ "extends": ["base"], "skills": ["react-component"], "mcp": ["context7"], "rules": ["react"] }
```

A project with `"presets": ["frontend"]` gets both skills, both MCP servers, and every rule and hook from both presets. A piece listed twice is installed once. agentproof-kit rejects a preset that extends itself, directly or through another preset.

[`examples/registry`](../examples/registry) has these two presets with every piece they name.

## Global install

`--global` installs pieces for your user instead of a project. It works with every command:

```sh
agentproof-kit init --global --registry ~/src/my-registry --preset base
agentproof-kit add --global mcp/github
agentproof-kit check --global
```

`agents.json` and `agents.lock` live in `$XDG_CONFIG_HOME/agentproof-kit` (default `~/.config/agentproof-kit`). Files go under your home directory: skills in `~/.agents/skills` (linked from `~/.claude/skills`), MCP servers in `~/.claude.json`, `~/.codex/config.toml` and `~/.cursor/mcp.json`, and rules in `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`, and Claude commands in `~/.claude/commands`. agentproof-kit changes only its own entries in these shared files.

Cursor user rules and Cursor and Codex commands have no documented user location, so `check --global` prints an `unsupported` warning for them. In both scopes, unsupported pieces are warnings and do not change the exit code. In a project, `check` warns about any piece installed both globally and in that project. [Decision 11](decisions/11-global-install.md) lists every path and its source.

## How the code is laid out

```
src/types.ts          the data model: pieces, presets, manifest, lock, adapter
src/parse.ts          turns JSON and frontmatter into typed values, or throws ParseError
src/registry.ts       loads a registry from a path or a git clone, reads and hashes pieces
src/resolve.ts        presets and add/remove to a sorted list of piece keys
src/adapters/*.ts     one file per target: pieces in, file contents out
src/project.ts        update, sync, check, and the AGENTS.md section
src/cli.ts            the command table, argument parsing, JSON and text output, exit codes
```

Parsing happens once, at the edge. `resolve.ts` and the adapters are pure functions, so the tests call them without touching git. `project.ts` compares each file's content before it writes, and writes through a temporary file and a rename. Two `sync` runs in a row leave the tree unchanged.

## Tests

```sh
npm test
npm run typecheck
npm run smoke
```

`npm run smoke` generates the example project and asks each installed agent CLI (`claude`, `codex`, `cursor-agent`) which MCP servers and settings it loaded. CLIs that are not installed are skipped, so CI runs only the generate step. [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs all three on every pull request.
