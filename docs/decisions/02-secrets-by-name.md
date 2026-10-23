# Secrets go in by name only

## Context

MCP servers need tokens. The registry is a git repo that many people read, and every project commits the files agent-kit generates.

## Decision

An MCP piece lists the names of the environment variables it needs, such as `GITHUB_PERSONAL_ACCESS_TOKEN`. It never holds a value. `parseMcp` rejects a piece whose `env` is an object, because an object can hold values. Each adapter writes a reference that the agent resolves at run time, such as `${env:NAME}` for Cursor and `${NAME}` for Claude Code. `check` fails when a named variable is not set.

## What you can safely change

- How a target references a variable, if that target documents the syntax. Change it in the adapter and add the source to `docs/formats.md`.
- Where `check` looks for variables. It reads `process.env` today. You can add a lookup in your secret manager, as long as `check` still only reports whether the value exists.

## What breaks if you change it

- If you allow values in a piece, a token lands in the registry and in the generated files of every project. Removing it means rotating the token and rewriting history in each repo.
- If you remove the `check` rule for missing variables, a missing token shows up later as an MCP server that fails to start inside the agent.
