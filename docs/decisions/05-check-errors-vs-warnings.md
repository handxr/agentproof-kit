# `check` separates errors from warnings

## Context

`check` runs in CI. A check that fails on things nobody can fix gets disabled, and a check that passes on a broken setup gives false confidence.

## Decision

`check` exits 1 on a problem that leaves the project different from what `agents.json` asks for:

- The lock is out of date, or the registry content differs from it.
- A generated file, or an owned entry in a shared file, was edited or deleted.
- A hand-written entry in a shared file has the name of an entry agent-kit needs.
- A required environment variable is not set.

`check` prints a warning and still exits 0 when a piece is installed with a known loss. An example is an `ask` permission that Cursor's `cli.json` has no list for. The adapter returns these in `warnings`.

A piece a target cannot install at all, such as commands for Codex or user rules for Cursor, is also a warning (`unsupported: ...`). Projects often target several agents and not every agent has every piece type, so failing would make `check` impossible to pass. The other targets still get the piece.

## What you can safely change

- The wording of any message.
- Moving a case between errors and warnings for your team, such as making unsupported pieces fail when every target is required for you. Make the change in `check` in `src/project.ts` and say why in your fork's docs.

## What breaks if you change it

- If drift becomes a warning, a hand edit to a generated file survives in the repo until the next `sync` silently reverts it.
- If you make unsupported pieces errors, a project that targets Codex can never pass `check` with a command piece.
- If you make the lossy-install cases errors, a project that targets Cursor can never pass `check` with a permission piece that uses `ask`.
