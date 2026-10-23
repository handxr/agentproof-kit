# Fork agentproof-kit for your team

This repo is a template. Your company forks it, renames the CLI, publishes it to a private npm registry, and points it at a private config registry. Teams then install your package, never this repo. The steps below use `acme` as the company and `@acme/agentproof-kit` as the package.

## 1. Fork and rename

1. Fork or copy this repo into your organization, for example `acme/agentproof-kit`.
2. Pick the command name. If you keep `agentproof-kit`, skip to step 3. Otherwise replace it everywhere, before any project uses your fork:

   ```sh
   rg -l agentproof-kit | xargs sed -i 's/agentproof-kit/acme-agents/g'
   rg -l AGENTPROOF_KIT_ | xargs sed -i 's/AGENTPROOF_KIT_/ACME_AGENTS_/g'
   ```

   On macOS use `sed -i ''`. [Where the name lives](#where-the-name-lives) lists what this touches.
3. Set the package name in `package.json` to your scope, for example `"name": "@acme/agentproof-kit"`.

## 2. Create your config registry

The config registry holds your skills, MCP servers, rules, and presets. Keep it in a separate private git repo, so you can change config without releasing the CLI.

1. Copy `examples/registry` into a new repo, for example `acme/agent-registry`.
2. Delete the example pieces you don't want, and remove their entries from `registry.json`.
3. Add a piece. Put its files in the folder for its type, then list its id, version, and description in `registry.json`.
4. Bump a piece's `version` in `registry.json` each time you change its files. The lockfile also records a content hash, so a forgotten bump still shows up.
5. Push the repo. Tag a release if you want projects to pin a ref.

Keep `skills/agentproof-kit` (renamed with the CLI). `init` installs it so agents know how to run the CLI.

Pieces in `mcp/` list environment variable names only. The CLI rejects an MCP file whose `env` is an object, because an object can hold secret values.

A registry can also be a local path, such as a folder inside a monorepo: `--registry ./agent-registry`.

## 3. Build and test

```sh
npm ci
npm test && npm run typecheck && npm run smoke
npm run build        # compiles src/ to dist/, which is what gets published
npm pack --dry-run   # lists the files in the package
```

Node does not strip TypeScript types inside `node_modules`, so the package ships the compiled `dist/`. `prepack` runs the build for you.

## 4. Publish to your private npm registry

`package.json` has `"private": true` so the template can't be published by accident. In your fork, remove that line and add a `publishConfig` for your registry. For GitHub Packages:

```json
"name": "@acme/agentproof-kit",
"publishConfig": { "registry": "https://npm.pkg.github.com" }
```

For Artifactory, Verdaccio, or a private scope on npmjs.com, use that registry's URL instead.

Add a `.npmrc` that reads the token from an environment variable:

```ini
@acme:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

Commit `.npmrc`, but never the token. Set `NPM_TOKEN` in your shell or as a CI secret, then:

```sh
npm version patch
npm publish
```

## 5. Use it in a project

Each developer needs the same `.npmrc` scope line and a read token in `NPM_TOKEN`. Then:

```sh
npx @acme/agentproof-kit init --registry github:acme/agent-registry#main --preset base
```

`update` clones the registry into `~/.cache/agentproof-kit` and writes the commit it used to `agents.lock`. Git uses the developer's own credentials for the private registry repo. Set `AGENTPROOF_KIT_CACHE` to move the cache.

Commit `agents.json`, `agents.lock`, `AGENTS.md`, and the generated files. Run `npx @acme/agentproof-kit check` in CI.

## 6. Keep up with upstream

Add this repo as a second remote and merge its changes when you want them:

```sh
git remote add upstream <url-of-this-template>
git fetch upstream
git merge upstream/master
```

If you renamed the CLI, the merge conflicts wherever upstream changed a line with the name in it. Resolve those by keeping your name, then run the tests. [docs/decisions/](decisions/README.md) explains what each upstream change protects.

## Add a target

1. Write `src/adapters/<target>.ts`. Export an `Adapter` with the piece types it supports and a `render` function. Skills are written to `.agents/skills/` for every target. If your target reads only its own skill directory, return a `link` file per skill, as `src/adapters/claude.ts` does. For a file that other tools also write, return owned entries instead of whole content.
2. Add the target to `TARGETS` in `src/types.ts` and to `ADAPTERS` in `src/adapters/index.ts`.
3. Add the format and its source to `docs/formats.md`.

`render` gets parsed pieces and returns file contents. It does no file I/O, so you can test it with plain objects.

## Add a piece type

1. Add the type to `PIECE_TYPES` and a variant to `PieceBody` in `src/types.ts`.
2. Parse it in `parseBody` in `src/registry.ts`.
3. Add the type to the `supports` set of each adapter that can write it, and render it there. `check` reports the type as unsupported for every other target.

## Know what each decision protects

[docs/decisions/](decisions/README.md) has one file per design decision. Each one says what you can change in your fork and what breaks if you change the decision itself. Read the matching file before you change the lockfile, `check`, an adapter, or the way agentproof-kit writes shared files.

## Where the name lives

`agentproof-kit` appears in these places. A full replace (step 1) covers them all:

- `package.json`: `name`, the `bin` key, and the `agentproof-kit` script.
- Help text, error messages, and the `fix` commands in `src/cli.ts`, `src/project.ts`, `src/parse.ts`, `src/resolve.ts`, and `src/registry.ts`.
- The global config directory `~/.config/agentproof-kit` (`userPlace` in `src/project.ts`).
- The cache directory `~/.cache/agentproof-kit` and the `AGENTPROOF_KIT_CACHE` variable in `src/registry.ts`.
- The skill: `SKILL` in `src/cli.ts` and `examples/registry/skills/agentproof-kit/`.
- The `AGENTS.md` markers `<!-- agentproof-kit:start -->` and `<!-- agentproof-kit:end -->` (`START` and `END` in `src/project.ts`).
- `.codex/rules/agentproof-kit.rules` in `src/adapters/codex.ts`.
- Test expectations, `README.md`, and the docs.

Rename before any project uses your fork. Projects generated with the old markers get a second `AGENTS.md` section, and the old Codex rules file stays until `update` deletes it as stale. After the replace, run `npm test` and `npm run smoke`, and regenerate `examples/project` with `update`.
