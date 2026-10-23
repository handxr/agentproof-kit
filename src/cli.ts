#!/usr/bin/env node
// Command-line boundary: parse argv, call one operation, print, set the exit code.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ParseError, parsePieceKey, splitKey } from "./parse.ts";
import { MANIFEST, check, readLock, readManifest, sync, update } from "./project.ts";
import { loadPiece, loadRegistry } from "./registry.ts";

const USAGE = `agent-kit <command> [options]

  init --registry <src> [--preset <id>]... [--target <t>]...   write agents.json, then update
  add <type>/<id>...        add pieces to agents.json, then update
  update                    re-resolve from the registry, rewrite agents.lock and files
  sync                      make files match agents.lock (no new versions)
  check                     fail on drift, outdated lock, missing env vars, unsupported pieces
  list                      list registry pieces and presets (* = installed)
  show <type>/<id>          print a piece's metadata and files

  --dir <path>              project directory (default: cwd)`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { dir: { type: "string" }, registry: { type: "string" }, preset: { type: "string", multiple: true }, target: { type: "string", multiple: true }, help: { type: "boolean", short: "h" } },
  });
  const [cmd, ...args] = positionals;
  const dir = values.dir ?? process.cwd();
  const report = (changed: string[]) => console.log(changed.length ? changed.map((c) => `  ${c}`).join("\n") : "  up to date");

  switch (cmd) {
    case "init": {
      if (existsSync(join(dir, MANIFEST))) throw new ParseError(`${MANIFEST} already exists`);
      if (!values.registry) throw new ParseError("init needs --registry");
      const manifest = { registry: values.registry, presets: values.preset ?? [], add: {}, remove: {}, targets: values.target ?? ["cursor", "claude", "codex"] };
      writeFileSync(join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
      readManifest(dir); // validate what we wrote
      report(update(dir));
      return 0;
    }
    case "add": {
      const m = readManifest(dir);
      const add: Record<string, string[]> = Object.fromEntries(Object.entries(m.add).map(([k, v]) => [k, [...v]]));
      for (const raw of args) {
        const { type, id } = splitKey(parsePieceKey(raw));
        const list = (add[type] ??= []);
        if (!list.includes(id)) list.push(id);
      }
      writeFileSync(join(dir, MANIFEST), `${JSON.stringify({ ...m, add }, null, 2)}\n`);
      report(update(dir));
      return 0;
    }
    case "update": report(update(dir)); return 0;
    case "sync": report(sync(dir)); return 0;
    case "check": {
      const { ok, problems, warnings } = check(dir);
      for (const w of warnings) console.log(`warning: ${w}`);
      console.log(ok ? "check: ok" : `check: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join("\n")}`);
      return ok ? 0 : 1;
    }
    case "list": {
      const m = readManifest(dir);
      const reg = loadRegistry(m.registry, dir, readLock(dir)?.registry.commit ?? null);
      const installed = new Set(Object.keys(readLock(dir)?.pieces ?? {}));
      for (const [k, meta] of reg.index) console.log(`${installed.has(k) ? "*" : " "} ${k.padEnd(28)} ${meta.version.padEnd(8)} ${meta.description}`);
      for (const [id, p] of reg.presets) console.log(`  presets/${id.padEnd(20)} extends [${p.extends.join(", ")}]`);
      return 0;
    }
    case "show": {
      const m = readManifest(dir);
      const reg = loadRegistry(m.registry, dir, readLock(dir)?.registry.commit ?? null);
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
