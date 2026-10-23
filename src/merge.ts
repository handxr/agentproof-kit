// Shared config files: agentproof-kit owns some entries, the user owns the rest.
// Each merger is pure: (current text, wanted entries, entries owned last time) -> new text and the problems it found.
import { ParseError } from "./parse.ts";
import type { JsonEntry, MergedFile } from "./types.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pointer = (path: readonly string[]) => `/${path.join("/")}`;

/** The id recorded in agents.lock. Items carry their value so a later run can find and remove them. */
export function entryId(file: MergedFile, i: number): string {
  if (file.kind === "toml") return `[${[...file.tables.keys()][i]}]`;
  if (file.kind === "lines") return `line:${file.lines[i]}`;
  const e = file.entries[i]!;
  return e.kind === "item" ? `${pointer(e.path)}[]${JSON.stringify(e.value)}` : e.kind === "default" ? `?${pointer(e.path)}` : pointer(e.path);
}
export const ownedIds = (file: MergedFile): string[] =>
  Array.from({ length: file.kind === "toml" ? file.tables.size : file.kind === "lines" ? file.lines.length : file.entries.length }, (_, i) => entryId(file, i));

export type MergeResult = { content: string | null; drift: string[] };

/** content null means the file should not exist. drift lists owned entries whose current value differs. */
export function merge(path: string, current: string | null, file: MergedFile, previous: readonly string[]): MergeResult {
  if (file.kind === "lines") return mergeLines(current, file.lines, previous);
  return file.kind === "json" ? mergeJson(path, current, file.entries, previous) : mergeToml(path, current, file.tables, previous);
}

/** Removal only: the file no longer has wanted entries. */
export const emptyLike = (path: string): MergedFile =>
  path.endsWith(".toml") ? { kind: "toml", tables: new Map() } : path.endsWith(".json") ? { kind: "json", entries: [] } : { kind: "lines", lines: [] };

/** Owned lines are appended if absent and removed when no longer wanted. Every other line stays byte for byte. */
function mergeLines(current: string | null, lines: readonly string[], previous: readonly string[]): MergeResult {
  const drift: string[] = [];
  const stale = new Set(previous.filter((id) => !lines.includes(id.slice(5))).map((id) => id.slice(5)));
  const kept = (current ?? "").split("\n").filter((l) => !stale.has(l.trim()));
  const missing = lines.filter((l) => !kept.some((k) => k.trim() === l));
  for (const l of missing) if (current !== null && previous.includes(`line:${l}`)) drift.push(`line "${l}" missing`);
  let text = kept.join("\n").replace(/\n+$/, "");
  if (missing.length) text = text ? `${text}\n\n${missing.join("\n")}` : missing.join("\n");
  if (text.trim() === "") return { content: null, drift };
  return { content: current !== null && text === current.replace(/\n+$/, "") ? current : `${text}\n`, drift };
}

function parent(root: Obj, path: readonly string[], where: string, create: boolean): Obj | null {
  let o: Obj = root;
  for (const k of path.slice(0, -1)) {
    if (o[k] === undefined) { if (!create) return null; o[k] = {}; }
    const next = o[k];
    if (!isObj(next)) throw new ParseError(`${where}: ${pointer(path)} expects an object at "${k}"`);
    o = next;
  }
  return o;
}

function mergeJson(where: string, current: string | null, entries: readonly JsonEntry[], previous: readonly string[]): MergeResult {
  const before: unknown = current === null ? {} : JSON.parse(current);
  if (!isObj(before)) throw new ParseError(`${where}: expected a JSON object`);
  const root = structuredClone(before);
  const file: MergedFile = { kind: "json", entries };
  const wanted = new Set(ownedIds(file));
  const drift: string[] = [];

  // Remove what we owned last time and no longer want.
  for (const id of previous) {
    if (wanted.has(id) || id.startsWith("?")) continue;
    const at = id.indexOf("[]");
    const path = (at < 0 ? id : id.slice(0, at)).slice(1).split("/");
    const p = parent(root, path, where, false);
    const last = path[path.length - 1]!;
    if (!p) continue;
    if (at < 0) delete p[last];
    else if (Array.isArray(p[last])) {
      const value = JSON.parse(id.slice(at + 2));
      p[last] = (p[last] as unknown[]).filter((x) => !same(x, value));
    }
    prune(root, path);
  }

  entries.forEach((e, i) => {
    const p = parent(root, e.path, where, true)!;
    const last = e.path[e.path.length - 1]!;
    const owned = previous.includes(entryId(file, i));
    if (e.kind === "default") { if (p[last] === undefined) p[last] = e.value; return; }
    if (e.kind === "key") {
      if (p[last] !== undefined && !same(p[last], e.value)) {
        if (!owned) throw new ParseError(`${where}: ${pointer(e.path)} already exists and agentproof-kit did not write it. Rename or remove your entry, or drop the piece from agents.json.`);
        drift.push(`${pointer(e.path)} edited`);
      } else if (p[last] === undefined && current !== null && owned) drift.push(`${pointer(e.path)} missing`);
      p[last] = e.value;
      return;
    }
    const list = p[last] ?? [];
    if (!Array.isArray(list)) throw new ParseError(`${where}: ${pointer(e.path)} expects a list`);
    if (!list.some((x) => same(x, e.value))) {
      if (current !== null && owned) drift.push(`${pointer(e.path)} missing ${JSON.stringify(e.value)}`);
      list.push(e.value);
    }
    p[last] = list;
  });

  const soft = new Set([...previous, ...wanted].filter((id) => id.startsWith("?")).map((id) => id.slice(2).split("/")[0]));
  const hard = entries.some((e) => e.kind !== "default");
  if (!hard && Object.keys(root).every((k) => soft.has(k))) return { content: null, drift };
  if (current !== null && same(root, before)) return { content: current, drift };
  return { content: `${JSON.stringify(root, null, 2)}\n`, drift };
}

/** Drop containers emptied by a removal, innermost first. */
function prune(root: Obj, path: readonly string[]) {
  for (let n = path.length; n > 0; n--) {
    const p = parent(root, path.slice(0, n), "", false);
    const k = path[n - 1]!;
    const v = p?.[k];
    if (p && (Array.isArray(v) ? v.length === 0 : isObj(v) && Object.keys(v).length === 0)) delete p[k];
    else if (p && v !== undefined) return;
  }
}

// TOML: agentproof-kit owns whole tables such as [mcp_servers.github]. It edits only those blocks of lines,
// so the user's comments, ordering and formatting elsewhere stay byte for byte.
const HEADER = /^\s*\[\[?\s*([^\[\]]+?)\s*\]\]?\s*(#.*)?$/;
type Block = { name: string | null; lines: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [{ name: null, lines: [] }];
  for (const line of text.replace(/\n$/, "").split("\n")) {
    const m = HEADER.exec(line);
    if (m) out.push({ name: line.trim().startsWith("[[") ? null : m[1]!, lines: [line] });
    else out[out.length - 1]!.lines.push(line);
  }
  return out;
}
const body = (b: Block) => { const l = [...b.lines]; while (l.length && l[l.length - 1]!.trim() === "") l.pop(); return l.join("\n"); };

function mergeToml(where: string, current: string | null, tables: ReadonlyMap<string, string>, previous: readonly string[]): MergeResult {
  const drift: string[] = [];
  const bs = current === null ? [] : blocks(current);
  const kept: Block[] = [];
  for (const b of bs) {
    const id = b.name === null ? null : `[${b.name}]`;
    if (id && previous.includes(id) && !tables.has(b.name!)) continue;
    kept.push(b);
  }
  for (const [name, text] of tables) {
    const id = `[${name}]`;
    const b = kept.find((x) => x.name === name);
    const want = text.trimEnd();
    if (!b) {
      if (current !== null && previous.includes(id)) drift.push(`${id} missing`);
      const last = kept[kept.length - 1];
      if (last && body(last) !== "") last.lines = [body(last), ""];
      kept.push({ name, lines: [...want.split("\n"), ""] });
    } else if (body(b) !== want) {
      if (!previous.includes(id)) throw new ParseError(`${where}: ${id} already exists and agentproof-kit did not write it. Rename or remove your table, or drop the piece from agents.json.`);
      drift.push(`${id} edited`);
      b.lines = [...want.split("\n"), ...b.lines.slice(body(b).split("\n").length)];
    }
  }
  const text = kept.filter((b) => b.lines.length).map((b) => b.lines.join("\n")).join("\n").replace(/\n+$/, "");
  if (text.trim() === "") return { content: null, drift };
  return { content: current !== null && text === current.replace(/\n+$/, "") ? current : `${text}\n`, drift };
}
