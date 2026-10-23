# CLI reference

This page lists the agentproof-kit commands, options, JSON output, problem codes, and exit codes. Scripts and agents can depend on everything on this page. A change to any of it is a breaking change.

## Commands

| Command | Writes | What it does |
| --- | --- | --- |
| `init --registry <src> [--preset <id>]... [--target <t>]... [--no-skill]` | yes | Writes `agents.json`, then runs `update`. Adds `skills/agentproof-kit` when the registry has it. |
| `add <type>/<id>...` | yes | Adds pieces to `agents.json`, then runs `update`. |
| `remove <type>/<id>...` | yes | Removes pieces from `agents.json`, then runs `update`. |
| `update` | yes | Resolves `agents.json` against the newest registry content, then rewrites `agents.lock` and the generated files. |
| `sync` | yes | Makes the generated files match `agents.lock`. |
| `check` | no | Reports drift, conflicts, an outdated lock, changed registry content, and missing environment variables. |
| `list` | no | Lists the registry's pieces and presets. |
| `show <type>/<id>` | no | Prints one piece's metadata and files. |

Every command takes these options:

| Option | Meaning |
| --- | --- |
| `--dir <path>` | The project directory. The default is the current directory. |
| `--global`, `-g` | Use your user setup instead of a project. You cannot combine it with `--dir`. |
| `--json` | Print one JSON result on stdout and nothing else there. |
| `--dry-run` | Lists the changes and writes nothing. Only commands that write accept it. |
| `--help`, `-h` | Prints help for the command and exits 0. |

agentproof-kit never reads stdin and never prompts. It prints color only when stderr is a terminal and `NO_COLOR` is not set. `--json` output never has color.

## JSON result

With `--json`, every command prints one object with these keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `ok` | boolean | `true` when `problems` is empty. |
| `command` | string | The command that ran, or `""` if none was given. |
| `scope` | `"project"` or `"user"` | `"user"` with `--global`. |
| `dryRun` | boolean | `true` with `--dry-run`. Then `changes` lists what would change. |
| `changes` | `{ path, action }[]` | Every file written or deleted. `action` is `"write"` or `"delete"`. `path` is relative to the project, or to `$HOME` with `--global`. |
| `problems` | `{ code, message, fix }[]` | What went wrong. See [Problem codes](#problem-codes). |
| `warnings` | string[] | Messages that do not change the exit code. Examples are `unsupported: codex: commands/ship` for a piece that a target cannot install, and `cursor lists each skill twice` when both `cursor` and `claude` are targets. |
| `data` | object | Only on `list` and `show`. |

`list` returns `data: { pieces: [{ key, version, description, installed }], presets: [{ id, extends }] }`. `show` returns `data: { key, version, description, hash, body }`.

```json
{
  "ok": false,
  "command": "add",
  "scope": "project",
  "dryRun": false,
  "changes": [],
  "problems": [
    {
      "code": "unknown-piece",
      "message": "not in registry: rules/reakt (did you mean rules/react?)",
      "fix": "agentproof-kit list"
    }
  ],
  "warnings": []
}
```

## Problem codes

`code` is stable. `message` is for people and can change between versions. `fix` is the exact command to run, with `--global` or `--dir` added when you passed them. `fix` is `null` when a person has to decide.

| Code | Cause | `fix` |
| --- | --- | --- |
| `usage` | Unknown command or option, a missing argument, or `--dry-run` on a command that does not write. | `agentproof-kit <command> --help` |
| `manifest-missing` | No `agents.json`. | `agentproof-kit init --registry <src>` |
| `manifest-exists` | `init` found an `agents.json`. | `agentproof-kit update` |
| `invalid-config` | `agents.json`, `agents.lock`, or a registry file is not valid. | `null` |
| `invalid-piece-key` | An argument is not `<type>/<id>`. | `agentproof-kit list` |
| `unknown-piece` | The registry has no such piece. The message suggests the closest key. | `agentproof-kit list` |
| `not-installed` | `remove` named a piece that is not installed. | `agentproof-kit list` |
| `unknown-preset` | The registry has no such preset. | `agentproof-kit list` |
| `registry-unavailable` | agentproof-kit cannot read the registry path, clone the repo, or find the ref. | `null` |
| `lock-missing` | No `agents.lock`. | `agentproof-kit update` |
| `lock-outdated` | `agents.json` changed since the last `update`. | `agentproof-kit update` |
| `registry-changed` | Registry content at the locked commit no longer matches a hash in the lock. | `agentproof-kit update` |
| `drift` | A generated file, an owned entry, or the `AGENTS.md` section is missing or differs from the lock. | `agentproof-kit sync` |
| `conflict` | A file or entry that agentproof-kit did not write already uses a name that it needs. | `null` |
| `env-missing` | An MCP server needs an environment variable that is not set. | `export NAME=<value>` |
| `internal` | Any other error. The message never includes a stack trace. | `null` |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | `ok` is `true`. Warnings may be present. |
| 1 | There is at least one problem. |
| 2 | The command line is wrong. The problem code is `usage`. |

## Text output

Without `--json`, agentproof-kit prints results to stdout, and warnings and problems to stderr:

```text
error[drift]: AGENTS.md managed section
  fix: agentproof-kit sync
```
