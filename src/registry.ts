// Load a registry from a local path or a git remote, and read pieces from it.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ParseError, isPieceType, parseFrontmatter, parseHook, parseMcp, parsePermissions, parsePieceKey, parsePreset, splitKey } from "./parse.ts";
import { hint } from "./resolve.ts";
import type { Piece, PieceBody, PieceKey, Preset, PresetId, Registry } from "./types.ts";

type Source = { kind: "path"; path: string } | { kind: "git"; url: string; ref: string };

/** `github:org/repo#ref`, `git:<url>#ref`, or a path relative to the project. */
export function parseSource(source: string, projectDir: string): Source {
  const [base, ref = "HEAD"] = source.split("#") as [string, string?];
  if (base.startsWith("github:")) return { kind: "git", url: `https://github.com/${base.slice(7)}.git`, ref };
  if (base.startsWith("git:")) return { kind: "git", url: base.slice(4), ref };
  return { kind: "path", path: isAbsolute(base) ? base : resolve(projectDir, base) };
}

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/**
 * Check out a git registry into the cache.
 * `pin` set: use that commit, fetching only if it is missing (sync).
 * `pin` null: fetch the ref and use its newest commit (update).
 */
function checkout(url: string, ref: string, pin: string | null): { root: string; commit: string } {
  const cache = process.env.AGENTPROOF_KIT_CACHE ?? join(homedir(), ".cache", "agentproof-kit");
  const root = join(cache, createHash("sha256").update(url).digest("hex").slice(0, 16));
  if (!existsSync(join(root, ".git"))) {
    mkdirSync(cache, { recursive: true });
    execFileSync("git", ["clone", "--quiet", "--no-checkout", url, root], { stdio: ["ignore", "pipe", "pipe"] });
  }
  const has = (c: string) => {
    try { git(root, "cat-file", "-e", `${c}^{commit}`); return true; } catch { return false; }
  };
  if (pin === null || !has(pin)) git(root, "fetch", "--quiet", "--tags", "origin", "+refs/heads/*:refs/remotes/origin/*");
  const commit = pin ?? resolveRef(root, ref);
  git(root, "checkout", "--quiet", "--force", commit);
  return { root, commit };
}

function fetchRegistry(url: string, ref: string, pin: string | null) {
  try {
    return checkout(url, ref, pin);
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ParseError(`registry ${url}: git failed (${String((e as { stderr?: unknown }).stderr ?? (e as Error).message).trim().split("\n")[0]})`, "registry-unavailable", null);
  }
}

function resolveRef(root: string, ref: string): string {
  for (const candidate of ref === "HEAD" ? ["origin/HEAD", "FETCH_HEAD", "HEAD"] : [`origin/${ref}`, ref]) {
    try { return git(root, "rev-parse", `${candidate}^{commit}`); } catch { /* try next */ }
  }
  throw new ParseError(`registry ref "${ref}" not found`, "registry-unavailable", null);
}

export function loadRegistry(source: string, projectDir: string, pin: string | null = null): Registry {
  const src = parseSource(source, projectDir);
  const { root, commit } = src.kind === "path" ? { root: src.path, commit: null } : fetchRegistry(src.url, src.ref, pin);
  const file = join(root, "registry.json");
  if (!existsSync(file)) throw new ParseError(`registry ${source}: no registry.json at ${root}`, "registry-unavailable", null);
  const json: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof json !== "object" || json === null) throw new ParseError("registry.json: expected an object");
  const index = new Map<PieceKey, { version: string; description: string }>();
  const presets = new Map<PresetId, Preset>();
  for (const [type, entries] of Object.entries(json as Record<string, unknown>)) {
    if (type === "name" || typeof entries !== "object" || entries === null) continue;
    for (const [id, meta] of Object.entries(entries as Record<string, { version?: string; description?: string }>)) {
      if (type === "presets") {
        const where = `presets/${id}.json`;
        presets.set(id as PresetId, parsePreset(JSON.parse(readFileSync(join(root, where), "utf8")), where));
      } else if (isPieceType(type)) {
        index.set(parsePieceKey(`${type}/${id}`), { version: meta.version ?? "0.0.0", description: meta.description ?? "" });
      } else throw new ParseError(`registry.json: unknown section "${type}"`);
    }
  }
  return { source, commit, root, index, presets };
}

/** Files that make up a piece, relative to the registry root. Sorted, so the hash is stable. */
function pieceFiles(root: string, key: PieceKey): string[] {
  const { type, id } = splitKey(key);
  if (type === "skills") return walk(join(root, "skills", id)).map((f) => relative(root, f)).sort();
  if (type === "hooks") {
    const { script } = parseHook(JSON.parse(readFileSync(join(root, "hooks", `${id}.json`), "utf8")), key);
    return [`hooks/${id}.json`, `hooks/${script}`];
  }
  const ext = type === "mcp" || type === "permissions" ? "json" : "md";
  return [`${type}/${id}.${ext}`];
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

export function loadPiece(reg: Registry, key: PieceKey): Piece {
  const meta = reg.index.get(key);
  if (!meta) throw new ParseError(`${key}: not in registry ${reg.source}${hint(key, [...reg.index.keys()])}`, "unknown-piece", "agentproof-kit list");
  const { type, id } = splitKey(key);
  const paths = pieceFiles(reg.root, key);
  const read = (p: string) => readFileSync(join(reg.root, p), "utf8");
  const hash = createHash("sha256");
  for (const p of paths) hash.update(`${p}\0${read(p)}\0`);
  return { key, id, version: meta.version, description: meta.description, hash: `sha256-${hash.digest("base64")}`, body: parseBody(type, id, paths, read, key) };
}

function parseBody(type: Piece["body"]["type"], id: string, paths: string[], read: (p: string) => string, key: string): PieceBody {
  switch (type) {
    case "skills":
      if (!paths.includes(`skills/${id}/SKILL.md`)) throw new ParseError(`${key}: missing SKILL.md`);
      return { type, files: new Map(paths.map((p) => [p.slice(`skills/${id}/`.length), read(p)])) };
    case "mcp":
      return { type, server: parseMcp(JSON.parse(read(paths[0]!)), key) };
    case "permissions":
      return { type, ...parsePermissions(JSON.parse(read(paths[0]!)), key) };
    case "hooks": {
      const h = parseHook(JSON.parse(read(paths[0]!)), key);
      return { type, event: h.event, scriptName: h.script, script: read(paths[1]!) };
    }
    case "rules": {
      const { data, body } = parseFrontmatter(read(paths[0]!));
      const globs = data.globs;
      return { type, description: String(data.description ?? ""), globs: Array.isArray(globs) ? globs : typeof globs === "string" ? globs.split(",").map((g) => g.trim()) : [], alwaysApply: data.alwaysApply === true, body };
    }
    case "commands":
      return { type, body: read(paths[0]!) };
    case "agents": {
      const { data, body } = parseFrontmatter(read(paths[0]!));
      return { type, name: String(data.name ?? id), description: String(data.description ?? ""), model: typeof data.model === "string" ? data.model : null, readonly: data.readonly === true, body };
    }
  }
}
