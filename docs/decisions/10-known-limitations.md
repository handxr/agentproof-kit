# Known limitations are listed, not hidden

## Context

agentproof-kit is small on purpose. A few edge cases would need a lot of code to handle fully. Instead of handling them halfway, this file lists them, so a fork knows what agentproof-kit does not handle.

## Decision

The template accepts these limits.

1. **Rewriting a shared JSON file reformats all of it.** When an owned entry in `.mcp.json`, `.claude/settings.json` or another shared JSON file changes, `src/merge.ts` parses the file and writes it back with two-space indentation. Your entries keep their values, but custom indentation, key spacing and trailing newlines elsewhere in the file are lost. A run that changes nothing does not touch the file.
2. **Lockfiles with `lockfileVersion: 1` are rejected.** `src/parse.ts` accepts only version 2. A project with a version 1 lock, from an early version of agentproof-kit, gets `unsupported lockfile`. There is no migration. Delete `agents.lock` and run `update`.
3. **A hand-written entry identical to an owned one is adopted.** If a shared file already has an entry with the same name and the same value that agentproof-kit wants to write, agentproof-kit takes ownership of it instead of failing. That way, a run that crashed between writing the file and writing the lock recovers. The cost is that removing the piece later also removes that entry.
4. **Dotted TOML keys outside a table are not detected.** The `.codex/config.toml` merge finds tables by their `[header]` line. A top-level `mcp_servers.github.command = "x"` is invisible to it, so agentproof-kit can add a `[mcp_servers.github]` table next to it, and Codex then rejects the duplicate.
5. **Cursor lists each skill twice when Claude Code is also a target.** Skills live once in `.agents/skills`, and `.claude/skills` links to each one so Claude Code finds them (see decision 08). Cursor reads both folders, in a project and under `$HOME`, so it shows every skill twice. Both entries are the same files, so they never disagree. `check` reports this as a warning, not a problem, so the exit code stays 0.

## What you can safely change

- Fix any of these in your fork. Each fix stays in one place. Limits 1, 3, and 4 live in `src/merge.ts`, limit 2 in `src/parse.ts`, and the warning for limit 5 in `check` in `src/project.ts`.

## What breaks if you change it

- If you make limit 3 fail instead of adopting the entry, a crash between writing a file and writing `agents.lock` leaves the project stuck until someone deletes the entry by hand.
- If you accept v1 lockfiles without migrating them, `sync` and `check` read a lock without `owned` entries and cannot tell agentproof-kit's entries from yours.
- If you fix limit 5 by skipping the `.claude/skills` link when Cursor is a target, Claude Code loses every skill.
