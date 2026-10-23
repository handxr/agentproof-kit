# Target formats

This page lists the file each adapter writes and the doc that defines the format. Each source was read on 2026-10-23. A piece type marked unsupported has no verified project-level format for that target, and `agentproof-kit check` fails if a project installs it there.

## Cursor

Adapter: `src/adapters/cursor.ts`.

| Piece | File | Source |
| --- | --- | --- |
| skills | `.agents/skills/<id>/SKILL.md`, or no copy of its own when Claude Code is also a target (see below) | https://cursor.com/docs/skills lists `.agents/skills/` and `.cursor/skills/` as project skill directories, and says Cursor also loads `.claude/skills/` and `.codex/skills/` for compatibility. |
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
| skills | `.claude/skills/<id>`, a relative symlink to `../../.agents/skills/<id>`. Symlinked skill folders are supported. | https://code.claude.com/docs/en/skills |
| mcp | `.mcp.json`, `{"mcpServers": {...}}`. HTTP servers need `"type": "http"`. Env as `${NAME}`. | https://code.claude.com/docs/en/mcp |
| rules | The `AGENTS.md` managed section, imported by a `@AGENTS.md` line in `CLAUDE.md` | https://code.claude.com/docs/en/memory |
| commands | `.claude/commands/<id>.md`. Claude merged commands into skills, and both paths still work. | https://code.claude.com/docs/en/skills |
| agents | `.claude/agents/<id>.md` with `name`, `description`, `model`, `tools` | https://code.claude.com/docs/en/sub-agents |
| hooks | `.claude/settings.json` `hooks.PreToolUse[].{matcher, hooks[{type: "command", command}]}`. Scripts use `"$CLAUDE_PROJECT_DIR"`. | https://code.claude.com/docs/en/hooks |
| permissions | `.claude/settings.json` `permissions.{allow, ask, deny}` with `Bash(npm run *)` rules | https://code.claude.com/docs/en/permissions |

Claude reads `AGENTS.md` only when the project has no `CLAUDE.md` (v2.1.277 and later), and a `CLAUDE.md` can import it with `@AGENTS.md` (https://code.claude.com/docs/en/memory). agentproof-kit owns that one line in `CLAUDE.md`: it creates the file if absent, appends the line to a hand-written file that lacks it, and never touches the other lines. The import works whether or not a `CLAUDE.md` existed, and on versions older than 2.1.277.

A `readonly` agent becomes `tools: Read, Grep, Glob`.

## Codex

Adapter: `src/adapters/codex.ts`.

| Piece | File | Source |
| --- | --- | --- |
| skills | `.agents/skills/<id>/SKILL.md` | https://developers.openai.com/codex/skills |
| mcp | `.codex/config.toml`, `[mcp_servers.<id>]` with `command`, `args`, `env_vars`, or `url`, `bearer_token_env_var` | https://developers.openai.com/codex/mcp, https://developers.openai.com/codex/config-basic |
| rules | The `AGENTS.md` managed section | https://developers.openai.com/codex/guides/agents-md |
| agents | `.codex/agents/<id>.toml` with `name`, `description`, `developer_instructions`, and optional `model` | https://developers.openai.com/codex/subagents |
| hooks | `.codex/hooks.json`, same shape as Claude's `hooks` object | https://developers.openai.com/codex/hooks |
| permissions | `.codex/rules/agentproof-kit.rules` with `prefix_rule(pattern = [...], decision = "allow" \| "prompt" \| "forbidden")` | https://developers.openai.com/codex/rules |
| commands | Unsupported. Custom prompts are deprecated in favor of skills and live in the user's home directory. | https://developers.openai.com/codex/custom-prompts |

Codex loads `.codex/config.toml`, `.codex/hooks.json`, and `.codex/rules/` only when the user trusts the project (https://developers.openai.com/codex/config-basic). Codex also asks the user to review non-managed hooks before they run.

Codex hooks support only the `preShell` event here. The docs show `matcher: "Bash"` for shell commands. They do not name the matcher for file edits, so `postEdit` hooks are unsupported.

Custom agents inherit the parent session's sandbox. A `readonly` agent gets a warning, because the TOML file cannot express it.

## Mapping summary

| Event or field | Cursor | Claude Code | Codex |
| --- | --- | --- | --- |
| hook `preShell` | `beforeShellExecution` | `PreToolUse`, matcher `Bash` | `PreToolUse`, matcher `Bash` |
| hook `postEdit` | `afterFileEdit` | `PostToolUse`, matcher `Edit\|Write` | unsupported |
| permission `ask` | warning, dropped | `ask` | `decision = "prompt"` |
| MCP env var | `${env:NAME}` | `${NAME}` | `env_vars = ["NAME"]` |

## One copy of each skill

Cursor reads `.agents/skills/`, `.claude/skills/` and `.codex/skills/` (https://cursor.com/docs/skills). Codex scans `.agents/skills` from the working directory up to the repo root (https://developers.openai.com/codex/skills). pi, Copilot in VS Code, Gemini CLI, OpenCode and Windsurf also read `.agents/skills`. Claude Code reads only `.claude/skills/` and says symlinked skill folders work (https://code.claude.com/docs/en/skills).

agentproof-kit writes every skill once, to `.agents/skills/<id>/`. When `claude` is a target it adds `.claude/skills/<id>`, a relative symlink to `../../.agents/skills/<id>`, one per skill, so hand-written skills can sit next to them in `.claude/skills/`.

Unconfirmed: Cursor reads both directories, so with `claude` targeted it may list each skill twice through the symlink. The Cursor docs do not say whether it merges skills with the same name or resolves symlinks.

## Checked against the real CLIs

`npm run smoke` (scripts/smoke-agents.sh) generates the example project in a temp dir and asks each installed CLI what it parsed, with a throwaway home per CLI and dummy env values. Last run 2026-10-23 (AK-4) with Claude Code 2.1.309, codex-cli 0.164.0 and cursor-agent 2026.10.22-27dcf5f: no format bugs found.

- Claude Code: `claude mcp list` lists both servers from `.mcp.json` as "Pending approval" (project servers need approval in an interactive session; `enableAllProjectMcpServers` in `.claude/settings.local.json` did not change that for `mcp list`). `claude doctor` reads project settings without a trust prompt and reports no invalid entries in `.claude/settings.json` (hooks, permissions); it does flag a malformed hook or permission list, so the check has teeth.
- Codex: project `.codex/` is ignored until the project is trusted (docs: "Codex loads project `.codex/` layers only when you trust the project"). The script trusts the temp dir with the documented `[projects."<path>"] trust_level = "trusted"` in a temp `CODEX_HOME`; then `codex mcp list` shows both servers, `env_vars` and `bearer_token_env_var`.
- Cursor CLI: `cursor-agent mcp list` lists both servers from `.cursor/mcp.json` as "needs approval".
- Not checked without a login: skills, rules, subagents, commands, hooks firing, and Cursor/Codex permissions. Each needs a model call.

`scripts/try-local.sh [dir]` runs `npm test`, `npm run smoke`, then one short prompt per CLI you are logged in to (`claude -p`, `codex exec --sandbox read-only --ephemeral`, `cursor-agent -p --trust` or `agent -p --trust`), and checks that the answer names the example skills. A CLI that is not logged in is skipped. It works on Node 24 or later and on macOS, which has no `timeout`.
