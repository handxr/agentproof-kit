# agentproof-kit

agentproof-kit is a CLI that installs agent configuration (skills, MCP servers, rules, commands, subagents, hooks, and permissions) from a shared registry into a project, for Cursor, Claude Code, and Codex.

This repo is a template, not a package. Nothing is published from here. Fork it, rename it, point it at your own config registry, and publish it to your company's private npm registry. See [Fork agentproof-kit for your team](docs/forking.md).

## Try it

You need Node 24 or later. These commands run the CLI from source against the example registry in `examples/registry`:

```sh
npm install
cd examples/project
node ../../src/cli.ts update
node ../../src/cli.ts check
```

`update` writes each agent's files and `agents.lock`. The example project already has them committed, so it prints `up to date`. `check` fails with exit code 1, because the example MCP servers `github` and `context7` need environment variables:

```text
error[env-missing]: CONTEXT7_API_KEY not set (needed by mcp/context7)
  fix: export CONTEXT7_API_KEY=<value>
error[env-missing]: GITHUB_PERSONAL_ACCESS_TOKEN not set (needed by mcp/github)
  fix: export GITHUB_PERSONAL_ACCESS_TOKEN=<value>
```

The registry stores only the names of these variables, never their values ([decision 2](docs/decisions/02-secrets-by-name.md)). Set placeholder values and run `check` again:

```sh
export CONTEXT7_API_KEY=placeholder GITHUB_PERSONAL_ACCESS_TOKEN=placeholder
node ../../src/cli.ts check
```

`check` prints `check: ok`. It also prints warnings, such as a permission that Cursor cannot express. Warnings do not change the exit code.

## What each agent supports

| Piece | Cursor | Claude Code | Codex |
| --- | --- | --- | --- |
| skills, mcp, agents | yes | yes | yes |
| rules | yes | via `AGENTS.md` | via `AGENTS.md` |
| commands | yes | yes | no |
| hooks | yes | yes | `preShell` only |
| permissions | single-word commands | yes | yes |

## Read the docs

- [Fork agentproof-kit for your team](docs/forking.md) shows how to rename it and publish it to a private registry.
- [How agentproof-kit works](docs/usage.md) covers the project files, the registry layout, presets, global installs, the code layout, and the tests.
- [The CLI reference](docs/cli.md) lists every command, the `--json` output, the problem codes, and the exit codes.
- [Target formats](docs/formats.md) lists every file that each agent reads.
- [Design decisions](docs/decisions/README.md) explains why it works this way. [Decision 10](docs/decisions/10-known-limitations.md) lists the known limitations.

## License

[MIT](LICENSE)
