# Claude reads the rules through `@AGENTS.md`

## Context

Codex and Cursor read `AGENTS.md`. Claude Code reads it only when the project has no `CLAUDE.md` (v2.1.277 and later), and a `CLAUDE.md` can import it with a line `@AGENTS.md` (https://code.claude.com/docs/en/memory). An earlier version wrote rules for Claude to `.claude/rules/<id>.md` with a `paths` frontmatter. That was a second copy of the same text.

## Decision

Rules live only in the managed `AGENTS.md` section, for every target. When `claude` is a target, agentproof-kit owns one line in `CLAUDE.md`, `@AGENTS.md`. It creates the file if it does not exist, appends the line to a hand-written `CLAUDE.md` that lacks it, and never touches the other lines. When `claude` leaves `targets`, agentproof-kit removes the line. If the file then has nothing else in it, agentproof-kit deletes the file.

`.claude/rules/` is no longer written. With the import in place, a rule in both places would load twice in Claude. The cost is path scoping. A rule with `globs` now always loads in Claude, with an "Applies to `src/**/*.tsx`" line in front of it, the same way Codex already gets it. For the short convention rules that a registry holds, one copy that every agent reads is worth more than loading on demand in one agent.

## What you can safely change

- Bring back `.claude/rules/` for rules with globs only, if your registry has long path-specific rules. Then leave those rules out of the `AGENTS.md` section for Claude, or they load twice.

## What breaks if you change it

- If agentproof-kit writes a whole `CLAUDE.md`, it erases what the user wrote there.
- If the import line goes and the user has a `CLAUDE.md`, Claude sees no rules at all.

## Known limits

Cursor reads both `AGENTS.md` and `.cursor/rules/`, so a project targeting Cursor and another agent gets each rule twice in Cursor. The `.claude/rules/` change did not cause this.
