# agentproof-kit

- Node 24 runs `src/*.ts` directly, so development needs no build step. `npm run build` compiles `dist/` only for the published package.
- Run `npm test` and `npm run typecheck` before you commit.
- After you change an adapter or the example registry, run `node ../../src/cli.ts update` in `examples/project` and commit the result.
- Every target format needs a source link in `docs/formats.md`. Do not add a format that you have not read in the target's docs.
