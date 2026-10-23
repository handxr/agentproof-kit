# `--global` installs for your user, with the same adapters

## Context

Some pieces belong to a person, not a project: a review skill, a GitHub MCP server, a force-push guard. Every target has a user-level location for most piece types, but not all of them, and the paths differ from the project ones only in a few places. Every path below was checked in the official docs:

| Piece | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| skills | `~/.claude/skills/<id>` (link to `~/.agents/skills/<id>`) ([skills](https://code.claude.com/docs/en/skills)) | `~/.agents/skills` ([skills](https://developers.openai.com/codex/skills)) | `~/.agents/skills` ([skills](https://cursor.com/docs/context/skills)) |
| mcp | `mcpServers` in `~/.claude.json` ([mcp](https://code.claude.com/docs/en/mcp), [settings](https://code.claude.com/docs/en/settings)) | `~/.codex/config.toml` ([config](https://developers.openai.com/codex/config-basic)) | `~/.cursor/mcp.json` ([mcp](https://cursor.com/docs/context/mcp)) |
| rules | section in `~/.claude/CLAUDE.md` ([memory](https://code.claude.com/docs/en/memory)) | section in `~/.codex/AGENTS.md` ([AGENTS.md](https://developers.openai.com/codex/guides/agents-md)) | unsupported: user rules live only in Cursor Settings ([rules](https://cursor.com/docs/context/rules)) |
| commands | `~/.claude/commands` ([claude-directory](https://code.claude.com/docs/en/claude-directory)) | unsupported (as in projects) | unsupported: no personal folder documented |
| agents | `~/.claude/agents` ([sub-agents](https://code.claude.com/docs/en/sub-agents)) | `~/.codex/agents` ([subagents](https://developers.openai.com/codex/subagents)) | `~/.cursor/agents` ([subagents](https://cursor.com/docs/context/subagents)) |
| hooks | `~/.claude/settings.json`, script `"$HOME"/.claude/hooks/x` ([hooks](https://code.claude.com/docs/en/hooks)) | `~/.codex/hooks.json`, script `$HOME/.codex/hooks/x` ([hooks](https://developers.openai.com/codex/hooks)) | `~/.cursor/hooks.json`, script `./hooks/x`, run from `~/.cursor` ([hooks](https://cursor.com/docs/agent/hooks)) |
| permissions | `~/.claude/settings.json` | `~/.codex/rules/agent-kit.rules` ([rules](https://developers.openai.com/codex/rules)) | `~/.cursor/cli-config.json` ([permissions](https://cursor.com/docs/cli/reference/permissions)) |

## Decision

`--global` on `init`, `add`, `update`, `sync` and `check` swaps the project directory for a `Place` in `src/project.ts`: `{ scope: "user", config, root }`. `agents.json` and `agents.lock` live in `config`, which is `$XDG_CONFIG_HOME/agent-kit` or `~/.config/agent-kit`. Files go under `root`, which is `$HOME`. A plain directory string still means the project place, so nothing else changed.

The adapters stay pure. `render(pieces, scope)` returns user paths when `scope` is `"user"`, and lists a piece type with no documented user location as unsupported, so `check --global` warns about it, as it does for projects ([decision 5](05-check-errors-vs-warnings.md)). Shared files use the same owned-entries merge as in projects ([decision 7](07-merge-owned-keys.md)), so your other entries in `~/.claude.json`, `~/.claude/settings.json` and the rest survive. The managed section goes into each agent's own instruction file instead of one `AGENTS.md`, so there is no `@AGENTS.md` import at user scope.

`check` in a project reads the user lock too and warns about each piece installed in both places, because most agents would load it twice.

## What you can safely change

- The config directory: only `userPlace` in `src/project.ts` knows it.
- Support another user path once its docs confirm it: change the adapter's `userSupports` and its user branch.

## What breaks if you change it

- Writing a user install with project paths (`.mcp.json`, `CLAUDE.md` in `$HOME`) produces files no agent reads at user scope.
- Taking a whole shared file such as `~/.claude.json` would wipe Claude's own state there. Only the owned entries may be touched.
- Tests that run without a throwaway HOME would write into the real one. `test/helpers.ts` sets one for every test process.

## Known limits

- Cursor also loads `~/.claude/skills`, so with both `claude` and `cursor` targeted it may list each skill twice, as in projects ([decision 8](08-one-skill-copy.md)).
- `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are not read. agent-kit always writes to `~/.codex` and `~/.claude`.
