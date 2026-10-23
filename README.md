# agent-kit

agent-kit installs agent configuration from a shared registry into a project, for Cursor, Claude Code, and Codex. A registry holds skills, MCP servers, rules, commands, subagents, hooks, and permissions. A project lists the presets and pieces it wants in `agents.json`. agent-kit writes each target's native files and records what it wrote in `agents.lock`.

This is a reference repo to read and fork. It is not published to npm. See [Fork agent-kit for your team](docs/forking.md).

## Try it

agent-kit needs Node 24 or later, which runs the TypeScript sources directly.

```sh
npm install
cd examples/project
node ../../src/cli.ts update
GITHUB_PERSONAL_ACCESS_TOKEN=x CONTEXT7_API_KEY=y node ../../src/cli.ts check
```

`update` writes 27 generated files under `.agents/`, `.cursor/`, `.claude/`, and `.codex/`, and `.mcp.json`. It also writes `agents.lock` and adds a managed section to `AGENTS.md`. `check` prints `check: ok` and exits 0. Without the two environment variables, `check` lists them and exits 1.

## Commands

| Command | What it does |
| --- | --- |
| `init --registry <src> [--preset <id>] [--target <t>]` | Writes `agents.json`, then runs `update`. |
| `add <type>/<id>...` | Adds pieces to `agents.json`, then runs `update`. |
| `update` | Reads the newest registry content, rewrites `agents.lock`, and rewrites the generated files. |
| `sync` | Makes the generated files match `agents.lock`. It never moves to newer registry content. |
| `check` | Exits 1 if a generated file was edited, the lock is out of date, an MCP env var is unset, or a target cannot install a piece. |
| `list` | Lists registry pieces and presets. An asterisk marks installed pieces. |
| `show <type>/<id>` | Prints a piece's version, hash, and parsed content. |

Every command takes `--dir <path>`. The default is the current directory.

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

`registry` is a path relative to the project, `github:<org>/<repo>#<ref>`, or `git:<url>#<ref>`. agent-kit clones git registries into `~/.cache/agent-kit`.

agent-kit resolves presets first, parents before children. It then adds `add` and drops `remove`.

`agents.lock` records the registry commit, each piece's version and content hash, and the hash of every generated file. `update` deletes files that the old lock listed and the new one does not.

`AGENTS.md` gets a section between `<!-- agent-kit:start -->` and `<!-- agent-kit:end -->`. agent-kit replaces only that section. Codex reads its rules from there.

Commit `agents.json`, `agents.lock`, `AGENTS.md`, and the generated files. Then a teammate gets the setup from `git pull`, and CI can run `check`.

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

MCP files list environment variable names, never values. agent-kit writes each target's own reference syntax, such as `${env:NAME}` for Cursor and `${NAME}` for Claude Code.

[`examples/registry`](examples/registry) has a `base` preset and a `frontend` preset that extends it.

## What each target supports

| Piece | Cursor | Claude Code | Codex |
| --- | --- | --- | --- |
| skills | yes | yes | yes |
| mcp | yes | yes | yes |
| rules | yes | yes | in `AGENTS.md` |
| commands | yes | yes | no |
| agents | yes | yes | yes |
| hooks | yes | yes | `preShell` only |
| permissions | single-word commands | yes | yes |

[Target formats](docs/formats.md) lists every file path and field, with a link to the doc that defines it.

## How the code is laid out

```
src/types.ts          the data model: pieces, presets, manifest, lock, adapter
src/parse.ts          turns JSON and frontmatter into typed values, or throws ParseError
src/registry.ts       loads a registry from a path or a git clone, reads and hashes pieces
src/resolve.ts        presets and add/remove to a sorted list of piece keys
src/adapters/*.ts     one file per target: pieces in, file contents out
src/project.ts        update, sync, check, and the AGENTS.md section
src/cli.ts            argument parsing and output
```

Parsing happens once, at the edge. `resolve.ts` and the adapters are pure functions, so the tests call them without touching git. `project.ts` compares each file's content before it writes, and writes through a temporary file and a rename. Two `sync` runs in a row leave the tree unchanged.

## Test

```sh
npm test
npm run typecheck
```
