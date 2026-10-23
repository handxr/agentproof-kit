# Target formats

This page lists the file each adapter writes and the doc that defines the format. Each source was read on 2026-10-23. A piece type marked unsupported has no verified project-level format for that target, and `agent-kit check` fails if a project installs it there.

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

## One copy of each skill

Cursor reads `.agents/skills/` and `.claude/skills/` (https://cursor.com/docs/skills). Claude Code reads `.claude/skills/` and lists no `.agents/skills/` location (https://code.claude.com/docs/en/skills). Codex scans `.agents/skills` from the working directory up to the repo root (https://learn.chatgpt.com/codex/build-skills). `skillDirs` in `src/project.ts` picks the fewest directories that cover every target:

| Targets | Skill directories written |
| --- | --- |
| cursor | `.agents/skills` |
| cursor, claude | `.claude/skills` |
| cursor, codex | `.agents/skills` |
| cursor, claude, codex | `.agents/skills` and `.claude/skills`. Cursor sees both copies. |

With all three targets no single directory works, because Claude Code does not read `.agents/skills` and Codex does not read `.claude/skills`. The Cursor docs do not say whether it merges two skills with the same name.


## Checked against the real CLIs

`npm run smoke` (scripts/smoke-agents.sh) generates the example project in a temp dir and asks each installed CLI what it parsed, with a throwaway home per CLI and dummy env values. Last run 2026-10-23 with Claude Code 2.1.309, codex-cli 0.164.0 and cursor-agent 2026.10.22-27dcf5f: no format bugs found.

- Claude Code: `claude mcp list` lists both servers from `.mcp.json` as "Pending approval" (project servers need approval in an interactive session; `enableAllProjectMcpServers` in `.claude/settings.local.json` did not change that for `mcp list`). `claude doctor` reads project settings without a trust prompt and reports no invalid entries in `.claude/settings.json` (hooks, permissions); it does flag a malformed hook or permission list, so the check has teeth.
- Codex: project `.codex/` is ignored until the project is trusted (docs: "Codex loads project `.codex/` layers only when you trust the project"). The script trusts the temp dir with the documented `[projects."<path>"] trust_level = "trusted"` in a temp `CODEX_HOME`; then `codex mcp list` shows both servers, `env_vars` and `bearer_token_env_var`.
- Cursor CLI: `cursor-agent mcp list` lists both servers from `.cursor/mcp.json` as "needs approval".
- Not checked without a login: skills, rules, subagents, commands, hooks firing, and Cursor/Codex permissions. Each needs a model call.
