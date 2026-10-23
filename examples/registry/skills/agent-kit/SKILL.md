---
name: agent-kit
description: Install, remove and check the skills, rules, MCP servers, commands, subagents, hooks and permissions this project gives to coding agents. Use when the task mentions agents.json, agents.lock, agent-kit, or adding a skill, rule or MCP server for Cursor, Claude Code or Codex.
---

# Use agent-kit

agent-kit writes agent setup files (`.cursor/`, `.claude/`, `.codex/`, `AGENTS.md`, `.mcp.json`) from one manifest, `agents.json`, and records what it wrote in `agents.lock`. You change the setup by running the CLI. You never edit the generated files.

## Before you start

- Pass `--json` to every command. Read the result from stdout and ignore stderr.
- The CLI never prompts, so you can run it without a terminal.
- If `agents.json` is missing, the result has a `manifest-missing` problem. Run its `fix` with the registry the user named.

## Add a piece

1. Find the key with `agent-kit list --json`. Each entry in `data.pieces` has a `key` such as `rules/react` and an `installed` flag.
2. Preview the change with `agent-kit add rules/react --dry-run --json`. `changes` lists every path it would write or delete.
3. Run `agent-kit add rules/react --json`.
4. Run `agent-kit check --json`. You are done when `ok` is `true`.

To remove a piece, run `agent-kit remove <type>/<id> --json`, then `agent-kit check --json`. Remove deletes only the files and entries agent-kit wrote, so hand-written rules and MCP servers stay.

## Read the result

Every command prints one object:

```json
{
  "ok": false,
  "command": "check",
  "scope": "project",
  "dryRun": false,
  "changes": [{ "path": ".cursor/rules/react.mdc", "action": "write" }],
  "problems": [{ "code": "drift", "message": "AGENTS.md managed section", "fix": "agent-kit sync" }],
  "warnings": ["unsupported: codex: commands/ship"]
}
```

The exit code is 0 when `ok` is true, 1 when there are problems, and 2 when the command line is wrong. `list` and `show` also return `data`.

## Fix a problem

Act on `code`, not on `message`. The message text can change between versions.

| code | What to do |
| --- | --- |
| `drift` | A generated file was edited. Run the `fix` (`agent-kit sync`). Move wanted changes into the registry or into text outside the managed section. |
| `lock-missing`, `lock-outdated`, `registry-changed` | Run the `fix` (`agent-kit update`). |
| `env-missing` | Ask the user to set the variable. Never ask them to paste a secret into the chat. |
| `unknown-piece`, `unknown-preset`, `not-installed` | Read the "did you mean" hint in `message`, or run `agent-kit list --json`. |
| `conflict` | A file or entry with that name already exists and agent-kit did not write it. Ask the user whether to rename theirs or drop the piece. |
| `usage` | Run the `fix` (`agent-kit <command> --help`) and correct the arguments. |
| anything else | Report the message to the user. |

When `fix` is not null, it is the exact command to run, scope and `--dir` included. Warnings never change the exit code. Mention them to the user if they matter for the task.

## Project or global

- Project scope is the default. The manifest sits in the project root and files go in the project. Use it for setup the team shares.
- `--global` installs for the user. The manifest sits in `~/.config/agent-kit` and files go under `$HOME`. Use it only when the user asks for their personal setup.
- `check` in a project warns when a piece is installed in both scopes.

## Do not

- Edit files that agent-kit generated. The next `sync` overwrites them, and `check` reports them as drift.
- Edit `agents.lock` by hand. Run `agent-kit update` instead.
- Pass `--global` unless the user asked for a personal setup.
