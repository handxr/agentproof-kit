# `check` separates errors from warnings

## Context

`check` runs in CI. If it fails on things that nobody can fix, teams turn it off. If it passes on a broken setup, teams trust a setup that does not work.

## Decision

`check` exits 1 on a problem that leaves the project different from what `agents.json` asks for:

- The lock is out of date, or the registry content differs from it.
- A generated file, or an owned entry in a shared file, was edited or deleted.
- A hand-written entry in a shared file has the name of an entry agentproof-kit needs.
- A required environment variable is not set.

`check` prints a warning and still exits 0 when a target can install only part of a piece. An example is an `ask` permission, because Cursor's `cli.json` has no `ask` list. The adapter returns these in `warnings`.

A piece that a target cannot install at all, such as a command for Codex or a user rule for Cursor, is also a warning. The warning starts with `unsupported:`. Projects often target several agents, and not every agent has every piece type. If these pieces failed `check`, many projects could never pass it. The other targets still get the piece.

## What you can safely change

- The wording of any message.
- Move a case between errors and warnings for your team, such as making unsupported pieces fail when every target is required for you. Make the change in `check` in `src/project.ts` and say why in your fork's docs.

## What breaks if you change it

- If drift becomes a warning, a hand edit to a generated file stays in the repo until the next `sync` reverts it without notice.
- If you make unsupported pieces errors, a project that targets Codex can never pass `check` with a command piece.
- If you make the lossy-install cases errors, a project that targets Cursor can never pass `check` with a permission piece that uses `ask`.
