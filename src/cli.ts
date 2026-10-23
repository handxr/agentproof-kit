#!/usr/bin/env node
// Command-line boundary: parse argv, call one operation, print, set the exit code.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ParseError, parsePieceKey, splitKey } from "./parse.ts";
import { add, check, init, readLock, readManifest, sync, update, userPlace } from "./project.ts";
import { loadPiece, loadRegistry } from "./registry.ts";

const USAGE = `agent-kit <command> [options]

  init --registry <src> [--preset <id>]... [--target <t>]...   write agents.json, then update
  add <type>/<id>...        add pieces to agents.json, then update
  update                    re-resolve from the registry, rewrite agents.lock and files
  sync                      make files match agents.lock (no new versions)
  check                     fail on drift, outdated lock, missing env vars (warns on unsupported pieces)
  list                      list registry pieces and presets (* = installed)
  show <type>/<id>          print a piece's metadata and files

  --dir <path>              project directory (default: cwd)
  --global                  install for your user instead of a project: agents.json and
                            agents.lock in $XDG_CONFIG_HOME/agent-kit (default ~/.config/agent-kit),
                            files under $HOME (init, add, update, sync, check)`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { dir: { type: "string" }, registry: { type: "string" }, preset: { type: "string", multiple: true }, target: { type: "string", multiple: true }, help: { type: "boolean", short: "h" }, global: { type: "boolean", short: "g" } },
  });
  const [cmd, ...args] = positionals;
  if (values.global && values.dir) throw new ParseError("--global and --dir cannot be combined");
  const dir = values.dir ?? process.cwd();
  const where = values.global ? userPlace() : dir;
  const config = typeof where === "string" ? where : where.config;
  const report = (changed: string[]) => console.log(changed.length ? changed.map((c) => `  ${c}`).join("\n") : "  up to date");

  switch (cmd) {
    case "init": {
      if (!values.registry) throw new ParseError("init needs --registry");
      report(init(where, { registry: values.registry, presets: values.preset ?? [], add: {}, remove: {}, targets: values.target ?? ["cursor", "claude", "codex"] }));
      return 0;
    }
    case "add": report(add(where, args)); return 0;
    case "update": report(update(where)); return 0;
    case "sync": report(sync(where)); return 0;
    case "check": {
      const { ok, problems, warnings } = check(where);
      for (const w of warnings) console.log(`warning: ${w}`);
      console.log(ok ? "check: ok" : `check: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join("\n")}`);
      return ok ? 0 : 1;
    }
    case "list": {
      const m = readManifest(config);
      const reg = loadRegistry(m.registry, config, readLock(config)?.registry.commit ?? null);
      const installed = new Set(Object.keys(readLock(config)?.pieces ?? {}));
      for (const [k, meta] of reg.index) console.log(`${installed.has(k) ? "*" : " "} ${k.padEnd(28)} ${meta.version.padEnd(8)} ${meta.description}`);
      for (const [id, p] of reg.presets) console.log(`  presets/${id.padEnd(20)} extends [${p.extends.join(", ")}]`);
      return 0;
    }
    case "show": {
      const m = readManifest(config);
      const reg = loadRegistry(m.registry, config, readLock(config)?.registry.commit ?? null);
      const p = loadPiece(reg, parsePieceKey(args[0] ?? ""));
      console.log(JSON.stringify({ key: p.key, version: p.version, description: p.description, hash: p.hash, body: p.body }, (_k, v: unknown) => (v instanceof Map ? Object.fromEntries(v) : v), 2));
      return 0;
    }
    default:
      console.log(USAGE);
      return cmd === undefined || values.help ? 0 : 2;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof ParseError) && !(e instanceof SyntaxError) && (e as NodeJS.ErrnoException).code === undefined) throw e;
  console.error(`agent-kit: ${(e as Error).message}`);
  process.exitCode = 1;
}
