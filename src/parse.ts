// Boundary parsing. Untrusted JSON and markdown become typed values here or fail loudly.
import { PIECE_TYPES, TARGETS } from "./types.ts";
import type { Frontmatter, ProblemCode, HookEvent, Lock, Manifest, McpServer, PieceKey, PieceLists, PieceType, Preset, PresetId, Target } from "./types.ts";

/** Every expected failure. The CLI turns it into a `Problem`. */
export class ParseError extends Error {
  readonly code: ProblemCode;
  readonly fix: string | null;
  constructor(message: string, code: ProblemCode = "invalid-config", fix: string | null = null) {
    super(message);
    this.code = code;
    this.fix = fix;
  }
}

const fail = (where: string, msg: string): never => {
  throw new ParseError(`${where}: ${msg}`);
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const stringList = (v: unknown, where: string): string[] =>
  v === undefined ? [] : Array.isArray(v) && v.every((x) => typeof x === "string") ? v : fail(where, "expected a list of strings");

const str = (v: unknown, where: string): string => (typeof v === "string" ? v : fail(where, "expected a string"));

const ID = /^[a-z0-9][a-z0-9-]*$/;
const id = (v: string, where: string): string => (ID.test(v) ? v : fail(where, `invalid id "${v}"`));

export const isPieceType = (v: string): v is PieceType => (PIECE_TYPES as readonly string[]).includes(v);

export function parsePieceKey(raw: string): PieceKey {
  const [type, name, extra] = raw.split("/");
  if (type === undefined || name === undefined || extra !== undefined || !isPieceType(type)) {
    throw new ParseError(`"${raw}": expected <type>/<id> with type one of ${PIECE_TYPES.join(", ")}`, "invalid-piece-key", "agentproof-kit list");
  }
  if (!ID.test(name)) throw new ParseError(`"${raw}": invalid id "${name}"`, "invalid-piece-key", "agentproof-kit list");
  return raw as PieceKey;
}

export const pieceKey = (type: PieceType, name: string): PieceKey => parsePieceKey(`${type}/${name}`);

export function splitKey(key: PieceKey): { type: PieceType; id: string } {
  const [type, name] = key.split("/") as [PieceType, string];
  return { type, id: name };
}

function pieceLists(v: unknown, where: string): PieceLists {
  if (v === undefined) return {};
  if (!isObject(v)) return fail(where, "expected an object of piece lists");
  const out: Partial<Record<PieceType, string[]>> = {};
  for (const [k, list] of Object.entries(v)) {
    if (k === "extends" || k === "description") continue;
    if (!isPieceType(k)) return fail(where, `unknown piece type "${k}"`);
    out[k] = stringList(list, `${where}.${k}`).map((x) => id(x, `${where}.${k}`));
  }
  return out;
}

export function parseManifest(json: unknown): Manifest {
  const w = "agents.json";
  if (!isObject(json)) return fail(w, "expected an object");
  const targets = stringList(json.targets ?? ["cursor", "claude", "codex"], `${w}.targets`).map((t) =>
    (TARGETS as readonly string[]).includes(t) ? (t as Target) : fail(`${w}.targets`, `unknown target "${t}"`),
  );
  return {
    registry: str(json.registry, `${w}.registry`),
    presets: stringList(json.presets, `${w}.presets`).map((p) => id(p, `${w}.presets`) as PresetId),
    add: pieceLists(json.add, `${w}.add`),
    remove: pieceLists(json.remove, `${w}.remove`),
    targets,
  };
}

export function parsePreset(json: unknown, where: string): Preset {
  if (!isObject(json)) return fail(where, "expected an object");
  return {
    extends: stringList(json.extends, `${where}.extends`).map((p) => id(p, `${where}.extends`) as PresetId),
    pieces: pieceLists(json, where),
  };
}

export function parseLock(json: unknown): Lock {
  const w = "agents.lock";
  if (!isObject(json) || json.lockfileVersion !== 2) return fail(w, "unsupported lockfile");
  const reg = isObject(json.registry) ? json.registry : fail(w, "missing registry");
  const pieces: Record<string, { version: string; hash: string }> = {};
  for (const [k, v] of Object.entries(isObject(json.pieces) ? json.pieces : {})) {
    if (!isObject(v)) return fail(w, `bad piece ${k}`);
    pieces[parsePieceKey(k)] = { version: str(v.version, `${w}.${k}`), hash: str(v.hash, `${w}.${k}`) };
  }
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(isObject(json.files) ? json.files : {})) files[k] = str(v, `${w}.files`);
  const owned: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(isObject(json.owned) ? json.owned : {})) owned[k] = stringList(v, `${w}.owned.${k}`);
  return {
    lockfileVersion: 2,
    registry: { source: str(reg.source, `${w}.registry.source`), commit: reg.commit === null ? null : str(reg.commit, `${w}.registry.commit`) },
    targets: parseManifest({ registry: "", targets: json.targets }).targets,
    pieces,
    files,
    owned,
  };
}

export function parseMcp(json: unknown, where: string): McpServer {
  if (!isObject(json)) return fail(where, "expected an object");
  if ("env" in json && isObject(json.env)) return fail(where, "env must list variable NAMES, not values");
  if (typeof json.url === "string") {
    return { kind: "http", url: json.url, bearerTokenEnv: json.bearerTokenEnv === undefined ? null : str(json.bearerTokenEnv, `${where}.bearerTokenEnv`) };
  }
  return { kind: "stdio", command: str(json.command, `${where}.command`), args: stringList(json.args, `${where}.args`), env: stringList(json.env, `${where}.env`) };
}

export function parseHook(json: unknown, where: string): { event: HookEvent; script: string } {
  if (!isObject(json)) return fail(where, "expected an object");
  const event = json.event === "preShell" || json.event === "postEdit" ? json.event : fail(where, "event must be preShell or postEdit");
  return { event, script: str(json.script, `${where}.script`) };
}

export function parsePermissions(json: unknown, where: string): { allow: string[]; ask: string[]; deny: string[] } {
  if (!isObject(json)) return fail(where, "expected an object");
  return { allow: stringList(json.allow, `${where}.allow`), ask: stringList(json.ask, `${where}.ask`), deny: stringList(json.deny, `${where}.deny`) };
}

/** A deliberately small frontmatter reader: `key: value`, `key: [a, b]`, booleans. */
export function parseFrontmatter(text: string): { data: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string | boolean | string[]> = {};
  for (const line of (m[1] ?? "").split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const raw = (kv[2] ?? "").trim();
    data[kv[1] as string] =
      raw === "true" ? true
      : raw === "false" ? false
      : raw.startsWith("[") ? raw.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean)
      : raw.startsWith('"') ? (JSON.parse(raw) as string)
      : unquote(raw);
  }
  return { data, body: m[2] ?? "" };
}

const unquote = (s: string): string => s.replace(/^["'](.*)["']$/, "$1");

/** Lists become one quoted comma-separated string: the form both Cursor `globs` and Claude `paths` accept. */
export function renderFrontmatter(data: Record<string, string | boolean | readonly string[] | null>): string {
  const scalar = (v: string) => (/^[\w./ -]*$/.test(v) && !v.startsWith(" ") ? v : JSON.stringify(v));
  const lines = Object.entries(data)
    .filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${typeof v === "boolean" ? String(v) : Array.isArray(v) ? JSON.stringify(v.join(",")) : scalar(v as string)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}
