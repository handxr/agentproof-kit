# The CLI is built for agents first

## Context

Most agentproof-kit runs will come from coding agents, not people. An agent reads output, decides and runs the next command. It cannot answer a prompt, it struggles with colored or free-form text, and it guesses badly when an error names no next step. Before this change, a missing `agents.json` printed a raw Node `ENOENT` error, `check` returned plain strings, and nothing told an agent the CLI existed.

## Decision

- Every command takes `--json` and prints one result object with the same keys: `ok`, `command`, `scope`, `dryRun`, `changes`, `problems`, `warnings` and, for `list` and `show`, `data`. [The CLI reference](../cli.md) documents it.
- Every expected failure is a `ParseError` with a `code` from `PROBLEM_CODES` in `src/types.ts` and a `fix` command. `src/cli.ts` turns anything else into an `internal` problem with no stack. The CLI appends `--global` or `--dir` to the fix, so an agent can run it as is.
- Exit codes are 0 for ok, 1 for problems and 2 for usage errors.
- Commands that write take `--dry-run`. `Place.dryRun` stops every write in `src/project.ts` but still reports the change.
- `remove` takes pieces out of `agents.json`, then runs `update`. The lock already lists what agentproof-kit wrote, so `update` deletes only those files and entries.
- The CLI never prompts or reads stdin, and prints color only to a terminal without `NO_COLOR`.
- The example registry ships `skills/agentproof-kit`, a skill that tells an agent when and how to use the CLI. `init` adds it when the registry has it, because an agent that does not know about agentproof-kit edits the generated files by hand. `--no-skill` leaves it out. A registry without the skill gets a warning, not an error.

## What you can safely change

- The human text output, help text and problem messages.
- The skill's wording. Keep the frontmatter `name` and `description`.
- Add a problem code. Add it to `PROBLEM_CODES`, to [the CLI reference](../cli.md) and to the skill's table.

## What breaks if you change it

- Renaming or removing a JSON key or a problem code breaks every agent and script that reads them. Treat it as a major version.
- Printing anything but the result on stdout with `--json` makes the output unparsable.
- A prompt hangs every agent run, because agents have no terminal.
- Dropping the default skill means agents stop finding the CLI on their own.
