# `sync` and `update` are separate commands

## Context

A project needs two things. It needs to rebuild the same files from the same lock on any machine, and it needs to move to newer registry content on purpose.

## Decision

`sync` makes the project match `agents.lock`. It loads the registry at the locked commit and never reads newer content. If a piece's content no longer matches its hash, `sync` stops and asks you to run `update`.

`update` resolves `agents.json` against the newest registry content, then rewrites `agents.lock` and the generated files. Its result is a diff that goes into a pull request.

A second run of either command writes nothing.

## What you can safely change

- When each command runs. For example, run `sync` from a git hook and `update` from a weekly CI job.
- Extra flags, such as `update --piece skills/code-review` to move one piece, as long as the result is still a lock diff.

## What breaks if you change it

- If `sync` reads the newest registry content, two people who run it on the same commit can get different files, and nobody reviews the change.
- If `update` stops rewriting the lock, `sync` and `check` keep pointing at the old content and report drift on every run.
