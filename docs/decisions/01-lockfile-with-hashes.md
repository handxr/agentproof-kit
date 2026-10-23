# The lockfile records versions and content hashes

## Context

A registry changes over time. A project needs to know which content it installed, and a reviewer needs to see when that content changes.

## Decision

`agents.lock` records the registry source and commit, and for each piece its version and a SHA-256 hash of its files. It also records the hash of every file agentproof-kit writes whole, and the entries it owns in shared files. `sync` refuses to run when the registry content for a piece no longer matches its hash.

The hash catches a change that a version alone misses. If someone edits a skill and forgets to bump its version in `registry.json`, the hash still changes and the edit still shows up in the lock diff.

## What you can safely change

- The hash algorithm, if you change the `sha256` calls in `src/project.ts` and `src/registry.ts` together and regenerate every lock.
- Extra fields in the lock, such as who ran `update`. `parseLock` ignores fields it does not read.
- The lock file name, through `LOCK` in `src/project.ts`.

## What breaks if you change it

- If you drop the hashes, `sync` can no longer tell that the registry moved under a pinned version. A teammate then gets different files from the same lock.
- If you drop `files` or `owned`, `update` can no longer delete what a removed piece left behind.
- If you change the lock layout, bump `lockfileVersion`. Old locks then fail with "unsupported lockfile", and each project has to run `update` once.
