# Each skill is written once per directory

## Context

Agents read skills from different project directories. Cursor reads `.agents/skills/` and also `.claude/skills/`. Claude Code reads `.claude/skills/`. Codex reads `.agents/skills/`. If agent-kit wrote one copy for each target, Cursor in a project that also targets Claude Code would list every skill twice. The sources are in [docs/formats.md](../formats.md#one-copy-of-each-skill).

## Decision

Each adapter declares the directories it reads in `skillDirs`, with its preferred one first. `skillDirs()` in `src/project.ts` picks the fewest directories that cover every target. Targets with fewer choices pick first. With Cursor and Claude Code, skills go only to `.claude/skills/`. With Codex in the mix, `.agents/skills/` is also written, because Codex does not read `.claude/skills/`.

## What you can safely change

- Add a directory to a target's `skillDirs` when its docs say it reads one. The picker uses it with no other change.
- Change a target's preferred directory by reordering its list.

## What breaks if you change it

- If you list a directory that the agent does not read, `check` passes and the agent has no skills.
- If adapters write skills themselves again, the duplicates come back in Cursor.

## Known limits

With Cursor, Claude Code, and Codex all targeted, no single directory covers every target, so Cursor sees two copies of each skill. The Cursor docs do not say whether it merges skills with the same name.
