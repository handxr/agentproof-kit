# Target formats

This page lists the file each adapter writes and the doc that defines the format. Each source was read on 2026-10-23. A piece type marked unsupported has no verified project-level format for that target, and `agent-kit check` fails if a project installs it there.

## Cursor

Adapter: `src/adapters/cursor.ts`.

| Piece | File | Source |
| --- | --- | --- |
| skills | `.agents/skills/<id>/SKILL.md` | https://cursor.com/docs/skills (Cursor also reads `.agents/skills`, `.claude/skills`, and `.codex/skills`) |
| mcp | `.cursor/mcp.json`, `{"mcpServers": {...}}`, env as `${env:NAME}` | https://cursor.com/docs/mcp |
| rules | `.cursor/rules/<id>.mdc` with `description`, `globs`, `alwaysApply` | https://cursor.com/docs/rules |
| commands | `.cursor/commands/<id>.md`. Cursor now treats commands as legacy and recommends skills. | https://cursor.com/help/customization/skills, and the `commands/` folder in https://cursor.com/docs/reference/plugins |
| agents | `.cursor/agents/<id>.md` with `name`, `description`, `model`, `readonly` | https://cursor.com/docs/subagents |
| hooks | `.cursor/hooks.json`, `{"version": 1, "hooks": {"beforeShellExecution": [{"command": ...}]}}`. Project hooks run from the repo root. | https://cursor.com/docs/hooks |
| permissions | `.cursor/cli.json`, `{"permissions": {"allow": ["Shell(git)"], "deny": [...]}}`. Applies to the Cursor CLI. | https://cursor.com/docs/cli/reference/permissions |

`Shell(<commandBase>)` matches on the first word of a command. A permission entry with more than one word, such as `git push`, gets a warning and is left out. The file has no `ask` list, so `ask` entries also get a warning.

Plugins use `skills/`, `rules/`, `agents/`, `commands/`, `hooks/hooks.json`, and `mcp.json` (https://cursor.com/docs/reference/plugins). This prototype does not emit plugins.

## Claude Code

Adapter: `src/adapters/claude.ts`.

| Piece | File | Source |
| --- | --- | --- |
| skills | `.claude/skills/<id>/SKILL.md` | https://code.claude.com/docs/en/skills |
| mcp | `.mcp.json`, `{"mcpServers": {...}}`. HTTP servers need `"type": "http"`. Env as `${NAME}`. | https://code.claude.com/docs/en/mcp |
| rules | `.claude/rules/<id>.md`. `paths` is the only frontmatter field Claude reads. | https://code.claude.com/docs/en/memory |
| commands | `.claude/commands/<id>.md`. Claude merged commands into skills, and both paths still work. | https://code.claude.com/docs/en/skills |
| agents | `.claude/agents/<id>.md` with `name`, `description`, `model`, `tools` | https://code.claude.com/docs/en/sub-agents |
| hooks | `.claude/settings.json` `hooks.PreToolUse[].{matcher, hooks[{type: "command", command}]}`. Scripts use `"$CLAUDE_PROJECT_DIR"`. | https://code.claude.com/docs/en/hooks |
| permissions | `.claude/settings.json` `permissions.{allow, ask, deny}` with `Bash(npm run *)` rules | https://code.claude.com/docs/en/permissions |

Claude reads `AGENTS.md` only when the project has no `CLAUDE.md` (https://code.claude.com/docs/en/memory). Rules therefore go to `.claude/rules/`, which loads either way.

A `readonly` agent becomes `tools: Read, Grep, Glob`.

## Codex

Adapter: `src/adapters/codex.ts`.

| Piece | File | Source |
| --- | --- | --- |
| skills | `.agents/skills/<id>/SKILL.md` | https://learn.chatgpt.com/codex/build-skills |
| mcp | `.codex/config.toml`, `[mcp_servers.<id>]` with `command`, `args`, `env_vars`, or `url`, `bearer_token_env_var` | https://learn.chatgpt.com/docs/extend/mcp, https://learn.chatgpt.com/docs/config-file/config-basic |
| rules | The `AGENTS.md` managed section | https://learn.chatgpt.com/codex/agent-configuration/agents-md |
| agents | `.codex/agents/<id>.toml` with `name`, `description`, `developer_instructions`, and optional `model` | https://learn.chatgpt.com/codex/agent-configuration/subagents |
| hooks | `.codex/hooks.json`, same shape as Claude's `hooks` object | https://learn.chatgpt.com/codex/hooks |
| permissions | `.codex/rules/agent-kit.rules` with `prefix_rule(pattern = [...], decision = "allow" \| "prompt" \| "forbidden")` | https://learn.chatgpt.com/codex/agent-configuration/rules |
| commands | Unsupported. Custom prompts are deprecated in favor of skills and live in the user's home directory. | https://learn.chatgpt.com/codex/custom-prompts |

Codex loads `.codex/config.toml`, `.codex/hooks.json`, and `.codex/rules/` only when the user trusts the project (https://learn.chatgpt.com/docs/config-file/config-basic). Codex also asks the user to review non-managed hooks before they run.

Codex hooks support only the `preShell` event here. The docs show `matcher: "Bash"` for shell commands. They do not name the matcher for file edits, so `postEdit` hooks are unsupported.

Custom agents inherit the parent session's sandbox. A `readonly` agent gets a warning, because the TOML file cannot express it.

## Mapping summary

| Event or field | Cursor | Claude Code | Codex |
| --- | --- | --- | --- |
| hook `preShell` | `beforeShellExecution` | `PreToolUse`, matcher `Bash` | `PreToolUse`, matcher `Bash` |
| hook `postEdit` | `afterFileEdit` | `PostToolUse`, matcher `Edit\|Write` | unsupported |
| permission `ask` | warning, dropped | `ask` | `decision = "prompt"` |
| MCP env var | `${env:NAME}` | `${NAME}` | `env_vars = ["NAME"]` |
