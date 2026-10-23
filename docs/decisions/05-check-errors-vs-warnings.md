# `check` separates errors from warnings

## Context

`check` runs in CI. A check that fails on things nobody can fix gets disabled, and a check that passes on a broken setup gives false confidence.

## Decision

`check` exits 1 on a problem that leaves the project different from what `agents.json` asks for:

- The lock is out of date, or the registry content differs from it.
- A generated file, or an owned entry in a shared file, was edited or deleted.
- A hand-written entry in a shared file has the name of an entry agent-kit needs.
- A required environment variable is not set.
- A target cannot install a piece at all, such as commands for Codex.

`check` prints a warning and still exits 0 when a piece is installed with a known loss. An example is an `ask` permission that Cursor's `cli.json` has no list for. The adapter returns these in `warnings`.

## What you can safely change

- The wording of any message.
- Moving a case from errors to warnings for your team, such as unsupported pieces when some targets are optional for you. Make the change in `check` in `src/project.ts` and say why in your fork's docs.

## What breaks if you change it

- If drift becomes a warning, a hand edit to a generated file survives in the repo until the next `sync` silently reverts it.
- If you make the lossy-install cases errors, a project that targets Cursor can never pass `check` with a permission piece that uses `ask`.
