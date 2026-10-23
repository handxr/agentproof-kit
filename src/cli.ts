#!/usr/bin/env node
// Command-line boundary: parse argv, run one command, print the result, set the exit code.
// Nothing here reads stdin or prompts. Every failure becomes a Problem with a stable code.
import { parseArgs } from "node:util";
import { ParseError, parsePieceKey } from "./parse.ts";
import { add, check, init, placeOf, readLock, readManifest, removePieces, sync, update, userPlace } from "./project.ts";
import type { Place } from "./project.ts";
import { loadPiece, loadRegistry } from "./registry.ts";
import type { Problem, ProblemCode, Scope } from "./types.ts";

/** The `--json` output of every command. The shape is documented in docs/cli.md. */
export type Result = {
  ok: boolean;
  command: string;
  scope: Scope;
  dryRun: boolean;
  changes: { path: string; action: "write" | "delete" }[];
  problems: Problem[];
  warnings: string[];
  data?: unknown;
};

type Opts = { registry?: string; preset?: string[]; target?: string[]; skill?: boolean };
type Outcome = { changed?: string[]; problems?: Problem[]; warnings?: string[]; data?: unknown; text?: string | undefined };
type Command = { usage: string; summary: string; writes: boolean; run: (where: Place, args: string[], o: Opts) => Outcome };

const SKILL = "skills/agentproof-kit";
const registryOf = (config: string) => loadRegistry(readManifest(config).registry, config, readLock(config)?.registry.commit ?? null);
const needKeys = (cmd: string, args: string[]) => {
  if (!args.length) throw new ParseError(`${cmd} needs at least one <type>/<id>`, "usage", `agentproof-kit ${cmd} --help`);
};

const COMMANDS: Record<string, Command> = {
  init: {
    usage: "init --registry <src> [--preset <id>]... [--target <t>]... [--no-skill]",
    summary: `Write agents.json, then update. Adds ${SKILL} when the registry has it, unless you pass --no-skill.`,
    writes: true,
    run: (where, _args, o) => {
      if (!o.registry) throw new ParseError("init needs --registry <src>", "usage", "agentproof-kit init --registry <src>");
      const warnings: string[] = [];
      const extra: Record<string, string[]> = {};
      if (o.skill !== false) {
        if (loadRegistry(o.registry, where.config, null).index.has(parsePieceKey(SKILL))) extra.skills = ["agentproof-kit"];
        else warnings.push(`registry ${o.registry} has no ${SKILL}; agents will not get the agentproof-kit skill`);
      }
      const changed = init(where, { registry: o.registry, presets: o.preset ?? [], add: extra, remove: {}, targets: o.target ?? ["cursor", "claude", "codex"] });
      return { changed, warnings };
    },
  },
  add: { usage: "add <type>/<id>...", summary: "Add pieces to agents.json, then update.", writes: true, run: (w, a) => (needKeys("add", a), { changed: add(w, a) }) },
  remove: {
    usage: "remove <type>/<id>...",
    summary: "Remove pieces from agents.json, then update. Deletes only the files and entries agentproof-kit wrote.",
    writes: true,
    run: (w, a) => (needKeys("remove", a), { changed: removePieces(w, a) }),
  },
  update: { usage: "update", summary: "Re-resolve agents.json from the registry. Rewrites agents.lock and the generated files.", writes: true, run: (w) => ({ changed: update(w) }) },
  sync: { usage: "sync", summary: "Make the generated files match agents.lock. Never fetches new piece versions.", writes: true, run: (w) => ({ changed: sync(w) }) },
  check: {
    usage: "check",
    summary: "Report drift, an outdated lock and missing env vars. Exits 1 on problems. Unsupported pieces are warnings.",
    writes: false,
    run: (w) => {
      const r = check(w);
      return { problems: r.problems, warnings: r.warnings, text: r.ok ? "check: ok" : undefined };
    },
  },
  list: {
    usage: "list",
    summary: "List the registry's pieces and presets. * marks installed pieces.",
    writes: false,
    run: (w) => {
      const reg = registryOf(w.config);
      const installed = new Set(Object.keys(readLock(w.config)?.pieces ?? {}));
      const pieces = [...reg.index].map(([key, m]) => ({ key, version: m.version, description: m.description, installed: installed.has(key) }));
      const presets = [...reg.presets].map(([id, p]) => ({ id, extends: [...p.extends] }));
      const text = [
        ...pieces.map((p) => `${p.installed ? "*" : " "} ${p.key.padEnd(28)} ${p.version.padEnd(8)} ${p.description}`),
        ...presets.map((p) => `  presets/${p.id.padEnd(20)} extends [${p.extends.join(", ")}]`),
      ].join("\n");
      return { data: { pieces, presets }, text };
    },
  },
  show: {
    usage: "show <type>/<id>",
    summary: "Print a piece's metadata and files.",
    writes: false,
    run: (w, a) => {
      if (a.length !== 1) throw new ParseError("show needs exactly one <type>/<id>", "usage", "agentproof-kit show --help");
      const p = loadPiece(registryOf(w.config), parsePieceKey(a[0]!));
      const data = JSON.parse(JSON.stringify({ key: p.key, version: p.version, description: p.description, hash: p.hash, body: p.body }, (_k, v: unknown) => (v instanceof Map ? Object.fromEntries(v) : v)));
      return { data, text: JSON.stringify(data, null, 2) };
    },
  },
};

const COMMON = `Options for every command:
  --dir <path>   Project directory. Default: the current directory.
  --global, -g   Use your user setup. agents.json and agents.lock go in $XDG_CONFIG_HOME/agentproof-kit
                 (default ~/.config/agentproof-kit), and generated files go under $HOME. Not with --dir.
  --json         Print one JSON result on stdout. See docs/cli.md for the schema.
  --dry-run      List the changes and write nothing. Only for commands that write.
  --help, -h     Show help for a command.

Exit codes: 0 ok, 1 problems, 2 usage error.`;

const USAGE = `Usage: agentproof-kit <command> [options]

Commands:
${Object.values(COMMANDS).map((c) => `  ${c.usage.split(" ")[0]!.padEnd(8)} ${c.summary}`).join("\n")}

${COMMON}

Run agentproof-kit <command> --help for one command.`;
const helpFor = (c: Command) => `Usage: agentproof-kit ${c.usage} [options]\n\n${c.summary}\n\n${COMMON}`;

const usageError = (message: string, fix = "agentproof-kit --help"): never => {
  throw new ParseError(message, "usage", fix);
};

function toProblem(e: unknown): Problem {
  if (e instanceof ParseError) return { code: e.code, message: e.message, fix: e.fix };
  if (e instanceof SyntaxError) return { code: "invalid-config", message: `invalid JSON: ${e.message}`, fix: null };
  const err = e as NodeJS.ErrnoException;
  if (typeof err?.code === "string" && err.code.startsWith("ERR_PARSE_ARGS")) return { code: "usage", message: err.message, fix: "agentproof-kit --help" };
  const where = err?.path ? ` (${err.path})` : "";
  return { code: "internal" satisfies ProblemCode, message: `${err?.code ? `${err.code}: ` : ""}${err?.message ?? String(e)}${where}`.replace(/^(\w+): \1: /, "$1: "), fix: null };
}

/** Make a fix command runnable as is: same scope, same --dir. */
function scopedFix(fix: string | null, extra: string): string | null {
  if (!fix || !fix.startsWith("agentproof-kit ") || fix.startsWith("agentproof-kit --") || fix.endsWith(" --help")) return fix;
  return fix + extra;
}

function main(argv: string[]): { result: Result; text?: string | undefined; json: boolean } {
  const json = argv.includes("--json");
  const result: Result = { ok: false, command: argv.find((a) => !a.startsWith("-")) ?? "", scope: argv.includes("--global") || argv.includes("-g") ? "user" : "project", dryRun: argv.includes("--dry-run"), changes: [], problems: [], warnings: [] };
  let extra = "";
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      allowNegative: true,
      options: {
        dir: { type: "string" }, registry: { type: "string" }, preset: { type: "string", multiple: true }, target: { type: "string", multiple: true },
        help: { type: "boolean", short: "h" }, global: { type: "boolean", short: "g" }, json: { type: "boolean" }, "dry-run": { type: "boolean" }, skill: { type: "boolean" },
      },
    });
    const [name, ...args] = positionals;
    result.command = name ?? "";
    if (values.global) extra += " --global";
    if (values.dir) extra += ` --dir ${values.dir}`;
    if (name === undefined) return { result: { ...result, ok: !!values.help }, text: USAGE, json: false };
    const cmd = COMMANDS[name];
    if (!cmd) usageError(`unknown command "${name}"`);
    if (values.help) return { result: { ...result, ok: true }, text: helpFor(cmd!), json: false };
    if (values.global && values.dir) usageError("use --global or --dir, not both", `agentproof-kit ${name} --help`);
    if (values["dry-run"] && !cmd!.writes) usageError(`--dry-run applies only to commands that write, and ${name} does not write`, `agentproof-kit ${name} --help`);
    const place: Place = { ...(values.global ? userPlace() : placeOf(values.dir ?? process.cwd())), dryRun: !!values["dry-run"] };
    const out = cmd!.run(place, args, values);
    result.changes = (out.changed ?? []).map((c) => (c.startsWith("- ") ? { path: c.slice(2), action: "delete" } : { path: c, action: "write" }));
    result.problems = out.problems ?? [];
    result.warnings = out.warnings ?? [];
    if (out.data !== undefined) result.data = out.data;
    result.ok = result.problems.length === 0;
    return { result, text: out.text, json };
  } catch (e) {
    result.problems = [toProblem(e)];
    return { result, json };
  } finally {
    for (const p of result.problems) p.fix !== undefined && Object.assign(p, { fix: scopedFix(p.fix, extra) });
  }
}

const color = (code: string, s: string, tty: boolean) => (tty && !process.env.NO_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);

function print({ result: r, text, json }: ReturnType<typeof main>) {
  if (json) return void process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  const errTty = !!process.stderr.isTTY;
  for (const w of r.warnings) console.error(`${color("33", "warning", errTty)}: ${w}`);
  if (text !== undefined) console.log(text);
  if (r.changes.length) console.log(`${r.dryRun ? "would change" : "changed"}:\n${r.changes.map((c) => `  ${c.action === "delete" ? "- " : ""}${c.path}`).join("\n")}`);
  else if (COMMANDS[r.command]?.writes && r.ok) console.log("up to date");
  for (const p of r.problems) console.error(`${color("31", `error[${p.code}]`, errTty)}: ${p.message.replaceAll("\n", "\n  ")}${p.fix ? `\n  fix: ${p.fix}` : ""}`);
}

const run = main(process.argv.slice(2));
print(run);
process.exitCode = run.result.ok ? 0 : run.result.problems.some((p) => p.code === "usage") ? 2 : 1;
