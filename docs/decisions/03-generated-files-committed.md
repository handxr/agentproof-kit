# Generated files are committed

## Context

Most people who open a project never touch its agent setup. They clone the repo and start their agent.

## Decision

Projects commit `agents.json`, `agents.lock`, `AGENTS.md`, and every file agentproof-kit writes. A fresh clone works with no agentproof-kit install. Only the person who changes `agents.json` or updates the registry needs the CLI.

## What you can safely change

- Which commands run the CLI, for example a `post-merge` git hook that runs `sync`, or a scheduled CI job that runs `update` and opens a pull request.
- `.gitignore` entries for files your team does not want in git, if every teammate runs `sync` after each pull instead.

## What breaks if you change it

- If you stop committing the generated files, every clone needs agentproof-kit, network access to the registry, and a `sync` before the agent sees any skill or MCP server.
- `check` compares the disk with the lock. In a repo without the generated files, CI has to run `sync` before `check`, so `check` can no longer catch a hand edit to a generated file.
