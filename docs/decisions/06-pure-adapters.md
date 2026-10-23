# Adapters are pure and declare what they support

## Context

Each agent stores its configuration in its own layout, and those layouts change every few months. Forks add targets that agentproof-kit does not ship.

## Decision

An adapter is an object in `src/adapters/`. It has a `target`, the set of piece types it `supports`, and a `render` function. `render` takes parsed pieces and returns files, an `AGENTS.md` section, unsupported pieces, and warnings. It never reads or writes the disk.

`src/project.ts` owns all disk access. It merges the output of every adapter, checks that two targets agree on any path they share, and writes only what changed.

## What you can safely change

- Add a target with a new file in `src/adapters/`, an entry in `ADAPTERS` in `src/adapters/index.ts`, and a name in `TARGETS` in `src/types.ts`.
- Change one adapter's output when its agent changes format. Record the source in `docs/formats.md`.
- Return a shared file as a list of owned entries instead of whole content. See [in shared files, agentproof-kit owns only its entries](07-merge-owned-keys.md).

## What breaks if you change it

- If an adapter writes to disk, `check` can no longer compute the expected state without touching the project, and a failing `update` can leave half-written files.
- If an adapter drops a piece instead of listing it in `unsupported`, `check` passes while the agent is missing the piece.
