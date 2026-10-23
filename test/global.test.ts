import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { add, check, init, sync, update, userPlace } from "../src/project.ts";
import { ENV, fixture, snapshot, writeJson, issues } from "./helpers.ts";

/** A throwaway HOME next to a registry copy. The registry path in agents.json is absolute. */
function home(env: Record<string, string> = {}) {
  const { registry, project } = fixture();
  const HOME = mkdtempSync(join(tmpdir(), "agentproof-kit-home-"));
  const e = { ...ENV, HOME, ...env };
  return { registry, project, HOME, env: e, place: userPlace(e) };
}
const manifest = (registry: string, more: Record<string, unknown> = {}) => ({ registry, presets: ["frontend"], add: {}, remove: { hooks: ["format-on-edit"] }, targets: ["cursor", "claude", "codex"], ...more });
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("--global writes into HOME and keeps agents.json and the lock in ~/.config/agentproof-kit", () => {
  const { registry, HOME, place } = home();
  init(place, manifest(registry));
  const tree = snapshot(HOME);
  assert.ok(tree[".config/agentproof-kit/agents.json"] && tree[".config/agentproof-kit/agents.lock"]);
  assert.ok(tree[".agents/skills/code-review/SKILL.md"]);
  assert.equal(tree[".claude/skills/code-review"], "-> ../../.agents/skills/code-review");
  assert.ok(json(join(HOME, ".claude.json")).mcpServers.github);
  assert.ok(json(join(HOME, ".cursor/mcp.json")).mcpServers.context7);
  assert.match(tree[".codex/config.toml"]!, /\[mcp_servers\.github\]/);
  assert.match(tree[".claude/CLAUDE.md"]!, /agentproof-kit:start[\s\S]*### typescript-strict/);
  assert.match(tree[".codex/AGENTS.md"]!, /### typescript-strict/);
  assert.equal(json(join(HOME, ".claude/settings.json")).hooks.PreToolUse[0].hooks[0].command, '"$HOME"/.claude/hooks/block-force-push.sh');
  // Nothing project-only leaks into HOME.
  for (const p of ["AGENTS.md", "CLAUDE.md", ".mcp.json", ".cursor/rules/react.mdc", ".claude/commands/ship.md", ".cursor/commands/ship.md"]) assert.equal(tree[p], undefined, p);
  assert.deepEqual(sync(place), []);
});

test("--global respects XDG_CONFIG_HOME", () => {
  const xdg = mkdtempSync(join(tmpdir(), "agentproof-kit-xdg-"));
  const { registry, HOME, place } = home({ XDG_CONFIG_HOME: xdg });
  init(place, manifest(registry));
  assert.ok(snapshot(xdg)["agentproof-kit/agents.lock"]);
  assert.equal(snapshot(HOME)[".config/agentproof-kit/agents.lock"], undefined);
});

test("--global keeps the user's own entries in ~/.claude.json and ~/.claude/settings.json", () => {
  const { registry, HOME, place } = home();
  writeJson(join(HOME, ".claude.json"), { numStartups: 7, mcpServers: { mine: { command: "my-server" } } });
  writeJson(join(HOME, ".claude/settings.json"), { model: "opus", permissions: { allow: ["Bash(ls)"] } });
  init(place, manifest(registry));
  const cj = json(join(HOME, ".claude.json")), st = json(join(HOME, ".claude/settings.json"));
  assert.equal(cj.numStartups, 7);
  assert.deepEqual(cj.mcpServers.mine, { command: "my-server" });
  assert.ok(cj.mcpServers.github);
  assert.equal(st.model, "opus");
  assert.ok(st.permissions.allow.includes("Bash(ls)") && st.permissions.allow.includes("Bash(git status)"));

  // Removing everything takes back only agentproof-kit's entries.
  writeJson(join(place.config, "agents.json"), manifest(registry, { presets: [] }));
  update(place);
  assert.deepEqual(json(join(HOME, ".claude.json")), { numStartups: 7, mcpServers: { mine: { command: "my-server" } } });
  assert.deepEqual(json(join(HOME, ".claude/settings.json")), { model: "opus", permissions: { allow: ["Bash(ls)"] } });
});

test("--global warns about pieces without a documented user location; claude commands go to ~/.claude/commands", () => {
  const { registry, HOME, place, env } = home();
  init(place, manifest(registry, { add: { commands: ["ship"] } }));
  assert.ok(existsSync(join(HOME, ".claude/commands/ship.md")));
  const { ok, problems, warnings } = check(place, env);
  assert.equal(ok, true);
  assert.deepEqual(problems.map((p) => `${p.code}: ${p.message}`), []);
  for (const u of ["cursor: commands/ship", "cursor: rules/react"]) assert.ok(warnings.some((w) => w.startsWith(`unsupported: ${u}`)), u);
  assert.ok(!warnings.some((w) => w.startsWith("unsupported: claude:")));
});

test("check passes on a clean global install and catches drift there", () => {
  const { registry, HOME, place, env } = home();
  init(place, manifest(registry, { targets: ["claude", "codex"] })); // Cursor has no file for user rules.
  assert.deepEqual(issues(check(place, env)), []);
  writeFileSync(join(HOME, ".codex/AGENTS.md"), "mine\n");
  assert.ok(issues(check(place, env)).includes("drift: .codex/AGENTS.md managed section"));
});

test("check in a project warns about pieces also installed globally", () => {
  const { registry, project, place, env } = home();
  init(place, manifest(registry, { presets: [], add: { skills: ["code-review"] } }));
  update(project);
  const { warnings } = check(project, env);
  assert.ok(warnings.includes("skills/code-review is installed both globally and in this project"));
  assert.equal(warnings.filter((w) => w.includes("globally")).length, 1);
});

test("add --global adds to the user manifest", () => {
  const { registry, HOME, place } = home();
  init(place, manifest(registry, { presets: [] }));
  add(place, ["agents/explorer"]);
  assert.ok(snapshot(HOME)[".claude/agents/explorer.md"]);
  assert.ok(snapshot(HOME)[".cursor/agents/explorer.md"]);
  assert.ok(snapshot(HOME)[".codex/agents/explorer.toml"]);
});
