# How agentproof-kit works

agentproof-kit reads one manifest, `agents.json`, resolves it against a registry of pieces, and writes each agent's own config files. This page explains how the parts fit together. [The registry and manifest reference](registry.md) lists every field, and [the CLI reference](cli.md) lists every command.

## The manifest says what you want, the lock says what you got

You edit `agents.json`. It names a registry, a list of presets, pieces to add or remove on top of the presets, and the targets to write for. agentproof-kit resolves presets first, parents before children. It then adds the pieces in `add` and drops the pieces in `remove`.

`update` writes the result to `agents.lock`. The lock records the registry commit, each piece's version and content hash, and the hash of every file that agentproof-kit writes whole. When `update` runs again, it deletes the files that the old lock listed and the new lock does not. [Decision 1](decisions/01-lockfile-with-hashes.md) explains why the lock holds hashes as well as versions.

## Sync rebuilds, update moves forward

`sync` and `update` do different jobs. `sync` loads the registry at the commit in `agents.lock` and makes the files on disk match the lock. It never reads newer registry content. `update` reads the newest registry content and rewrites the lock. Run `sync` after you pull, and run `update` when you want new pieces or new versions.

If the registry content at the locked commit no longer matches a piece's hash, `sync` and `check` both fail and tell you to run `update`. [Decision 4](decisions/04-sync-vs-update.md) covers why the two commands are separate.

## Some files are shared with you

agentproof-kit writes most files whole. A few files also hold settings that you or the agent wrote: `.mcp.json`, `.cursor/mcp.json`, `.cursor/hooks.json`, `.cursor/cli.json`, `.claude/settings.json`, `.codex/hooks.json`, and `.codex/config.toml`. In these files, agentproof-kit manages only its own entries, such as one MCP server or one permission rule. It records them under `owned` in `agents.lock`.

Entries that you add by hand stay. If one of your entries has the same name as an entry that agentproof-kit wants to write, `update` stops with a `conflict` error that names it. [Decision 7](decisions/07-merge-owned-keys.md) has the details.

`AGENTS.md` works the same way. agentproof-kit writes a section between `<!-- agentproof-kit:start -->` and `<!-- agentproof-kit:end -->` and replaces only that section. The rules for every target go there. Codex and Cursor read `AGENTS.md` directly. For Claude Code, agentproof-kit adds the line `@AGENTS.md` to `CLAUDE.md` and leaves the rest of that file alone ([decision 9](decisions/09-claude-rules-via-agents-md.md)).

## Each skill is written once

agentproof-kit writes every skill to `.agents/skills/<id>/`. Claude Code reads only `.claude/skills/`, so when `claude` is a target, agentproof-kit adds `.claude/skills/<id>` as a symlink to that copy. Your own skills in `.claude/skills/` stay. Cursor reads both folders and lists each skill twice, and `check` warns about it ([decision 8](decisions/08-one-skill-copy.md)).

## Projects commit the generated files

Commit `agents.json`, `agents.lock`, `AGENTS.md`, and the generated files. A teammate then gets the setup from `git pull` without installing agentproof-kit, and CI can run `check` to catch hand edits. Git must keep symlinks for the links in `.claude/skills/`. Git does this by default on macOS and Linux. [Decision 3](decisions/03-generated-files-committed.md) explains the trade-off.

## Presets build on each other

A preset is a named list of pieces. A preset can extend other presets, so a team keeps one `base` preset and builds on it. The example registry has two presets.

`presets/base.json`:

```json
{
  "description": "Every repo: review skill, commit rules, GitHub MCP, explorer agent, git safety",
  "skills": ["code-review"],
  "mcp": ["github"],
  "rules": ["conventional-commits", "typescript-strict"],
  "agents": ["explorer"],
  "hooks": ["block-force-push"],
  "permissions": ["safe-git"]
}
```

`presets/frontend.json`:

```json
{
  "description": "Frontend repos: base plus React skill, rules, docs MCP and formatting",
  "extends": ["base"],
  "skills": ["react-component"],
  "mcp": ["context7"],
  "rules": ["react"],
  "hooks": ["format-on-edit"]
}
```

A project with `"presets": ["frontend"]` gets every piece from both presets. agentproof-kit installs a piece that two presets list only once. It rejects a preset that extends itself, directly or through another preset.

## Secrets stay out of the registry

An MCP piece lists the names of the environment variables it needs, never their values. Each adapter writes the reference syntax of its target, such as `${env:NAME}` for Cursor and `${NAME}` for Claude Code. The agent reads the value from your environment when it starts the server. `check` fails with `env-missing` when a named variable is not set ([decision 2](decisions/02-secrets-by-name.md)).

## Global installs use the same model

`--global` installs pieces for your user instead of a project. Every command accepts it:

```sh
agentproof-kit init --global --registry ~/src/my-registry --preset base
agentproof-kit add --global mcp/github
agentproof-kit check --global
```

The manifest and the lock live in `$XDG_CONFIG_HOME/agentproof-kit`, which defaults to `~/.config/agentproof-kit`. The files go under your home directory. For example, skills go to `~/.agents/skills` with links from `~/.claude/skills`, and MCP servers go to `~/.claude.json`, `~/.codex/config.toml`, and `~/.cursor/mcp.json`. agentproof-kit changes only its own entries in these shared files.

Cursor user rules, Cursor commands, and Codex commands have no documented user location. `check --global` prints an `unsupported` warning for them. In both scopes, unsupported pieces are warnings and do not change the exit code. In a project, `check` also warns about each piece that is installed both globally and in that project. [Decision 11](decisions/11-global-install.md) lists every user path and its source.

## Adapters turn pieces into files

The code has one job per file:

```text
src/types.ts          the data model: pieces, presets, manifest, lock, adapter
src/parse.ts          turns JSON and frontmatter into typed values, or throws ParseError
src/registry.ts       loads a registry from a path or a git clone, and reads and hashes pieces
src/resolve.ts        turns presets, add, and remove into a sorted list of piece keys
src/merge.ts          applies owned entries to shared JSON and TOML files
src/adapters/*.ts     one file per target: pieces in, file contents out
src/project.ts        init, add, remove, update, sync, check, and the AGENTS.md section
src/cli.ts            the command table, argument parsing, output, and exit codes
```

`src/parse.ts` validates input once, when it enters the program. `src/resolve.ts` and the adapters are pure functions, so tests call them with plain objects and no git. `src/project.ts` does all the disk access. It compares each file with what is on disk before it writes, and it writes through a temporary file and a rename. Two `sync` runs in a row leave the tree unchanged ([decision 6](decisions/06-pure-adapters.md)).

## Tests run against the real agent CLIs when they are installed

`npm test` runs the unit tests and `npm run typecheck` runs `tsc`. `npm run smoke` generates the example project and asks each installed agent CLI (`claude`, `codex`, `cursor-agent`) which MCP servers and settings it loaded. It skips a CLI that is not installed, so on the CI runner it only checks that the example project generates. [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs all of these on every pull request and on every push to `master`.

To try the example on your machine with the agent CLIs that you are logged in to, run `bash scripts/try-local.sh`. [Checked against the real CLIs](formats.md#checked-against-the-real-clis) describes what each script checks.
