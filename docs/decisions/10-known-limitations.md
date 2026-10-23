# Known limitations are kept, not hidden

## Context

agent-kit is small on purpose. A few edge cases would need a lot of code to handle fully. Instead of handling them halfway, this file lists them so a fork knows where the edges are.

## Decision

These limits are accepted in the reference version:

1. **Rewriting a shared JSON file reformats all of it.** When an owned entry in `.mcp.json`, `.claude/settings.json` or another shared JSON file changes, `src/merge.ts` parses the file and writes it back with two-space indentation. Your entries keep their values, but custom indentation, key spacing and trailing newlines elsewhere in the file are lost. A run that changes nothing does not touch the file.
2. **Lockfiles with `lockfileVersion: 1` are rejected.** `src/parse.ts` accepts only version 2. A project with a v1 lock (from the first prototype) gets `unsupported lockfile`. Delete `agents.lock` and run `update`; there is no migration.
3. **A hand-written entry identical to an owned one is adopted.** If a shared file already has an entry with the same name and the same value that agent-kit wants to write, agent-kit takes ownership of it instead of failing. This lets a run that crashed between writing the file and writing the lock recover. The cost: removing the piece later also removes that entry.
4. **Dotted TOML keys outside a table are not detected.** The `.codex/config.toml` merge finds tables by their `[header]` line. A top-level `mcp_servers.github.command = "x"` is invisible to it, so agent-kit may add a `[mcp_servers.github]` table next to it and Codex will reject the duplicate.

## What you can safely change

- Fix any of these in your fork. Each one is local: (1) and (4) live in `src/merge.ts`, (2) in `src/parse.ts`, (3) in the ownership check in `src/merge.ts`.

## What breaks if you change it

- If you make (3) fail instead of adopt, a crash between writing a file and writing `agents.lock` leaves the project stuck until someone deletes the entry by hand.
- If you accept v1 lockfiles without migrating them, `sync` and `check` read a lock without `owned` entries and cannot tell agent-kit's entries from yours.
