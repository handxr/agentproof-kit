# In shared files, agent-kit owns only its entries

## Context

Some files hold settings from more than one source. A project may already list its own MCP server in `.mcp.json` or its own permission rules in `.claude/settings.json`. If agent-kit rewrote these files whole, `update` would delete that work.

These files are shared: `.mcp.json`, `.cursor/mcp.json`, `.cursor/hooks.json`, `.cursor/cli.json`, `.claude/settings.json`, `.codex/hooks.json`, and `.codex/config.toml`.

## Decision

For a shared file, an adapter returns entries instead of content. `src/merge.ts` applies them to what is on disk:

- A `key` entry owns one value, such as `/mcpServers/github`.
- An `item` entry owns one element of a list, such as one rule in `/permissions/allow`.
- A `default` entry sets a value only when it is missing and never owns it, such as `version` in `.cursor/hooks.json`.
- In `.codex/config.toml`, agent-kit owns whole tables such as `[mcp_servers.github]`. It edits those lines only, so your comments and formatting elsewhere in the file stay as they are.

`agents.lock` lists the owned entries under `owned`. On the next run, agent-kit removes any owned entry the manifest no longer asks for and leaves every other entry alone. If a shared file has nothing left but defaults, agent-kit deletes it.

If the file already has an entry with the same name and a different value, and the lock does not list it as owned, `update` stops with an error that names the file and the entry. If the value is the same, agent-kit takes ownership of it. That way, a run that crashed after writing the file and before writing the lock recovers on the next run.

`check` reports drift only for owned entries. Edits to your own entries never fail `check`.

## What you can safely change

- Which entries a target owns, by changing what its adapter returns.
- The JSON formatting. agent-kit rewrites a JSON file with two-space indentation only when an owned entry changes.

## What breaks if you change it

- If an adapter returns a shared file whole again, `update` deletes every hand-written entry in it.
- If you stop recording `owned` in the lock, a removed MCP server or permission stays in the file forever, because agent-kit cannot tell it apart from a hand-written one.
- If agent-kit took over clashing entries without an error, it would overwrite a teammate's server config with the registry's.

## Known limits

- An `item` entry that matches an element you wrote by hand counts as owned, so removing the piece also removes your element.
- The TOML merge finds tables by their `[header]` line. It does not see keys set with dotted names outside a table, such as `mcp_servers.github.command = "x"` at the top level.

All known limits are collected in [Known limitations](10-known-limitations.md).
