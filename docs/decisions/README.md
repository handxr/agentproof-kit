# Design decisions

Each file explains one decision in agentproof-kit. It gives the context, the decision, what you can change in your fork without breaking anything, and what breaks if you change the decision itself.

1. [The lockfile records versions and content hashes](01-lockfile-with-hashes.md)
2. [Secrets go in by name only](02-secrets-by-name.md)
3. [Generated files are committed](03-generated-files-committed.md)
4. [`sync` and `update` are separate commands](04-sync-vs-update.md)
5. [`check` separates errors from warnings](05-check-errors-vs-warnings.md)
6. [Adapters are pure and declare what they support](06-pure-adapters.md)
7. [In shared files, agentproof-kit owns only its entries](07-merge-owned-keys.md)
8. [Each skill is written once, to `.agents/skills`](08-one-skill-copy.md)
9. [Claude reads the rules through `@AGENTS.md`](09-claude-rules-via-agents-md.md)
10. [Known limitations](10-known-limitations.md)
11. [`--global` installs for your user, with the same adapters](11-global-install.md)
12. [The CLI is built for agents first](12-agent-first-cli.md)
