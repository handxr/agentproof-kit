# Each skill is written once, to `.agents/skills`

## Context

Most agents now read project skills from `.agents/skills/`: Cursor, Codex, pi, Copilot in VS Code, Gemini CLI, OpenCode and Windsurf. Claude Code reads only `.claude/skills/`, and its docs say symlinked skill folders work. The sources are in [docs/formats.md](../formats.md#one-copy-of-each-skill).

The previous design had each adapter declare `skillDirs` and picked the fewest directories covering every target. With all three targets that still meant two real copies, which could drift apart and which Cursor listed twice.

## Decision

`render` in `src/project.ts` writes every skill once, to `.agents/skills/<id>/`. When `claude` is a target, the Claude adapter returns one `link` file per skill: `.claude/skills/<id>` pointing at `../../.agents/skills/<id>`. The link is relative, so it survives a clone to any path.

Links are recorded in `agents.lock` under `files` as `link:<target>`. `check` reports a link that is missing, replaced by a real folder, or pointing elsewhere. `sync` restores it. `update` deletes links for skills that left the manifest, or all of them when `claude` leaves `targets`. A folder of yours with the same name in `.claude/skills/` stops `update` before anything is written.

Per-skill links, not one link for the whole `.claude/skills/` directory, so your hand-written skills keep living there.

## What you can safely change

- Point a new target at `.agents/skills/` by doing nothing: it is always written.
- For a target that reads only its own directory, return a `link` per skill from its adapter, as Claude does.

## What breaks if you change it

- If you write a real copy into `.claude/skills/` again, the two copies can drift and Cursor sees two different skills with one name.
- An absolute link target breaks for everyone who clones the repo somewhere else.
- On Windows, git checks symlinks out as plain text files unless `core.symlinks` is on. Claude then sees no skill there. `check` reports it as drift and `sync` restores the link.

## Known limits

Unconfirmed: Cursor reads `.claude/skills/` too, so with `claude` targeted it may still list each skill twice through the symlink. The Cursor docs do not say whether it resolves symlinks or merges skills with the same name. `scripts/try-local.sh` asks each logged-in CLI to name its skills, which would show a duplicate.
