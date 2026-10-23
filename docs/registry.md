# Registry and manifest reference

This page lists the files in a registry and the fields in `agents.json`. [How agentproof-kit works](usage.md) explains how they fit together.

## `agents.json`

```json
{
  "registry": "github:your-org/agent-registry#main",
  "presets": ["frontend"],
  "add": { "commands": ["ship"] },
  "remove": { "hooks": ["format-on-edit"] },
  "targets": ["cursor", "claude", "codex"]
}
```

| Field | Meaning |
| --- | --- |
| `registry` | Where the registry lives. One of: a path relative to the project, `github:<org>/<repo>#<ref>`, or `git:<url>#<ref>`. agentproof-kit clones git registries into `~/.cache/agentproof-kit`, or into `$AGENTPROOF_KIT_CACHE` when it is set. |
| `presets` | Preset ids to install. |
| `add` | Pieces to install on top of the presets, by type. |
| `remove` | Pieces to leave out, by type. |
| `targets` | Agents to write files for: `cursor`, `claude`, `codex`. |

## Registry layout

```text
registry.json                 index of pieces and presets, with versions
skills/<id>/SKILL.md          plus any supporting files in the folder
mcp/<id>.json                 {"command", "args", "env": [NAMES]} or {"url", "bearerTokenEnv"}
rules/<id>.md                 frontmatter: description, globs, alwaysApply
commands/<id>.md
agents/<id>.md                frontmatter: name, description, model, readonly
hooks/<id>.json               {"event": "preShell" | "postEdit", "script": "<file>"}
hooks/<script>
permissions/<id>.json         {"allow": [...], "ask": [...], "deny": [...]} shell command prefixes
presets/<id>.json             {"description", "extends": [...], "skills": [...], "mcp": [...], and the other piece types}
```

`env` in an MCP file is a list of variable names. `parseMcp` rejects an `env` that is an object. [`examples/registry`](../examples/registry) has one or more pieces of every type.
