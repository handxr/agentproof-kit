import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

export const EXAMPLE_REGISTRY = new URL("../examples/registry", import.meta.url).pathname;
// Tests never touch the real home: every test process gets a throwaway HOME and no XDG_CONFIG_HOME.
process.env.HOME = mkdtempSync(join(tmpdir(), "agent-kit-home-"));
delete process.env.XDG_CONFIG_HOME;
export const ENV = { GITHUB_PERSONAL_ACCESS_TOKEN: "x", CONTEXT7_API_KEY: "y", HOME: process.env.HOME };

/** A fresh copy of the example registry and a project next to it. */
export function fixture(manifest: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-kit-"));
  const registry = join(root, "registry");
  const project = join(root, "project");
  cpSync(EXAMPLE_REGISTRY, registry, { recursive: true });
  writeJson(join(project, "agents.json"), {
    registry: "../registry", presets: ["frontend"], add: {}, remove: { hooks: ["format-on-edit"] }, targets: ["cursor", "claude", "codex"], ...manifest,
  });
  return { root, registry, project };
}

export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** path -> content for every file under dir. A symlink maps to "-> <target>" and is not followed. */
export function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out[relative(dir, p)] = `-> ${readlinkSync(p)}`;
      else if (st.isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

/** Problems as "code: message" lines, for short assertions. */
export const issues = (r: { problems: readonly { code: string; message: string }[] }): string[] => r.problems.map((p) => `${p.code}: ${p.message}`);
