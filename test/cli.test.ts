import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ENV, fixture, snapshot } from "./helpers.ts";

const CLI = join(import.meta.dirname, "../src/cli.ts");
const COMMANDS = ["init", "add", "remove", "update", "sync", "check", "list", "show"];
const KEYS = ["ok", "command", "scope", "dryRun", "changes", "problems", "warnings"];

function run(args: string[], env: Record<string, string | undefined> = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, ...ENV, ...env }, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const json = (args: string[], env: Record<string, string | undefined> = {}) => {
  const r = run([...args, "--json"], env);
  return { status: r.status, out: JSON.parse(r.stdout), stderr: r.stderr };
};

test("--json: every command prints one result with the same keys", () => {
  const { project } = fixture();
  const out = (args: string[]) => json([...args, "--dir", project]).out;
  for (const [cmd, ...rest] of [["update"], ["sync"], ["check"], ["list"], ["show", "rules/react"], ["add", "agents/explorer"], ["remove", "agents/explorer"]] as const) {
    const r = out([cmd, ...rest]);
    for (const k of KEYS) assert.ok(k in r, `${cmd} has ${k}`);
    assert.equal(r.command, cmd);
  }
  const empty = mkdtempSync(join(tmpdir(), "agent-kit-init-"));
  const r = json(["init", "--registry", fixture().registry, "--dir", empty]).out;
  assert.equal(r.command, "init");
  assert.ok(r.changes.some((c: { path: string; action: string }) => c.path === "agents.json" && c.action === "write"));
  assert.deepEqual(Object.keys(out(["list"]).data), ["pieces", "presets"]);
  assert.equal(out(["show", "rules/react"]).data.key, "rules/react");
});

test("exit codes: 0 ok, 1 problems, 2 usage", () => {
  const { project } = fixture();
  assert.equal(run(["update", "--dir", project]).status, 0);
  assert.equal(run(["check", "--dir", project]).status, 0);
  writeFileSync(join(project, "AGENTS.md"), "edited\n");
  assert.equal(run(["check", "--dir", project]).status, 1);
  assert.equal(run(["frobnicate"]).status, 2);
  assert.equal(run(["check", "--bogus"]).status, 2);
  assert.equal(run(["add", "--dir", project]).status, 2);
  assert.equal(run(["check", "--global", "--dir", project]).status, 2);
  assert.equal(run(["check", "--dry-run", "--dir", project]).status, 2);
});

test("errors carry a stable code and the exact fix command, never a Node stack", () => {
  const empty = mkdtempSync(join(tmpdir(), "agent-kit-none-"));
  for (const cmd of COMMANDS.filter((c) => c !== "init")) {
    const args = cmd === "show" || cmd === "add" || cmd === "remove" ? [cmd, "rules/react"] : [cmd];
    const r = json([...args, "--dir", empty]);
    assert.equal(r.status, 1, cmd);
    assert.deepEqual(r.out.problems, [{ code: "manifest-missing", message: `no agents.json in ${empty}`, fix: `agent-kit init --registry <src> --dir ${empty}` }]);
  }
  const human = run(["check", "--dir", empty]);
  assert.doesNotMatch(human.stderr, /at .*\.ts:\d+|ENOENT|node:internal/);
  assert.match(human.stderr, /^error\[manifest-missing\]: .*\n {2}fix: agent-kit init --registry <src>/);

  const { project } = fixture();
  const typo = json(["add", "rules/reakt", "--dir", project]).out.problems[0];
  assert.equal(typo.code, "unknown-piece");
  assert.match(typo.message, /rules\/reakt \(did you mean rules\/react\?\)/);
  assert.equal(typo.fix, `agent-kit list --dir ${project}`);
  assert.equal(json(["add", "nope", "--dir", project]).out.problems[0].code, "invalid-piece-key");
  assert.equal(json(["init", "--dir", project]).out.problems[0].code, "usage");
  assert.equal(json(["init", "--registry", "../registry", "--dir", project]).out.problems[0].code, "manifest-exists");
  assert.equal(json(["check", "--dir", project]).out.problems[0].fix, `agent-kit update --dir ${project}`);

  const home = mkdtempSync(join(tmpdir(), "agent-kit-h-"));
  const g = json(["check", "--global"], { HOME: home }).out;
  assert.equal(g.scope, "user");
  assert.equal(g.problems[0].fix, "agent-kit init --registry <src> --global");

  writeFileSync(join(project, "agents.json"), "{ not json");
  const bad = json(["update", "--dir", project]);
  assert.equal(bad.out.problems[0].code, "invalid-config");
  const missing = json(["update", "--dir", fixture({ registry: "../nowhere" }).project]).out.problems[0];
  assert.equal(missing.code, "registry-unavailable");
});

test("check problems: drift fixes with sync, env with export", () => {
  const { project } = fixture();
  run(["update", "--dir", project]);
  writeFileSync(join(project, "AGENTS.md"), "edited\n");
  const r = json(["check", "--dir", project], { GITHUB_PERSONAL_ACCESS_TOKEN: "" }).out;
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems.map((p: { code: string; fix: string }) => [p.code, p.fix]), [
    ["drift", `agent-kit sync --dir ${project}`],
    ["env-missing", "export GITHUB_PERSONAL_ACCESS_TOKEN=<value>"],
  ]);
});

test("--dry-run lists the changes and touches nothing", () => {
  const { project } = fixture();
  const before = snapshot(project);
  const r = json(["update", "--dry-run", "--dir", project]).out;
  assert.equal(r.dryRun, true);
  assert.ok(r.changes.length > 5);
  assert.deepEqual(snapshot(project), before);
  run(["update", "--dir", project]);
  const installed = snapshot(project);
  for (const args of [["add", "agents/explorer"], ["remove", "rules/react"], ["sync"], ["update"]]) {
    json([...args, "--dry-run", "--dir", project]);
    assert.deepEqual(snapshot(project), installed, args.join(" "));
  }
  const removal = json(["remove", "rules/react", "--dry-run", "--dir", project]).out.changes;
  assert.ok(removal.some((c: { path: string; action: string }) => c.path === ".cursor/rules/react.mdc" && c.action === "delete"));
  assert.match(run(["update", "--dry-run", "--dir", fixture().project]).stdout, /^would change:/m);
});

test("remove deletes only what agent-kit wrote, in a project and with --global", () => {
  const { project } = fixture({ add: { agents: ["explorer"] } });
  run(["update", "--dir", project]);
  writeFileSync(join(project, ".cursor/rules/mine.mdc"), "mine\n");
  const mcp = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf8"));
  mcp.mcpServers.mine = { command: "mine" };
  writeFileSync(join(project, ".mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`);

  const r = json(["remove", "agents/explorer", "rules/react", "mcp/github", "--dir", project]);
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(readFileSync(join(project, "agents.json"), "utf8"));
  assert.deepEqual(m.add.agents, []);
  assert.deepEqual(m.remove.rules, ["react"]);
  assert.ok(!existsSync(join(project, ".cursor/rules/react.mdc")));
  assert.ok(existsSync(join(project, ".cursor/rules/mine.mdc")));
  const after = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf8")).mcpServers;
  assert.ok(!("github" in after) && "mine" in after);
  assert.equal(run(["check", "--dir", project]).status, 0);
  assert.equal(json(["remove", "rules/react", "--dir", project]).out.problems[0].code, "not-installed");
  assert.equal(json(["add", "rules/react", "--dir", project]).status, 0);
  assert.ok(existsSync(join(project, ".cursor/rules/react.mdc")));

  const home = mkdtempSync(join(tmpdir(), "agent-kit-h-"));
  const reg = fixture().registry;
  assert.equal(json(["init", "--global", "--registry", reg, "--preset", "base"], { HOME: home }).status, 0);
  const g = json(["remove", "--global", "rules/conventional-commits"], { HOME: home });
  assert.equal(g.status, 0, g.stderr);
  assert.ok(g.out.changes.some((c: { path: string; action: string }) => c.path === ".config/agent-kit/agents.json"));
  assert.ok(!existsSync(join(home, ".cursor/rules/conventional-commits.mdc")));
  assert.equal(run(["check", "--global"], { HOME: home }).status, 0);
});

test("never colored without a TTY or with NO_COLOR; --help works per command", () => {
  const empty = mkdtempSync(join(tmpdir(), "agent-kit-none-"));
  assert.doesNotMatch(run(["check", "--dir", empty]).stderr, /\x1b\[/);
  assert.doesNotMatch(run(["check", "--dir", empty], { NO_COLOR: "1" }).stderr, /\x1b\[/);
  for (const cmd of COMMANDS) {
    const h = run([cmd, "--help"]);
    assert.equal(h.status, 0);
    assert.match(h.stdout, new RegExp(`^Usage: agent-kit ${cmd}`));
    assert.match(h.stdout, /Exit codes: 0 ok, 1 problems, 2 usage error\./);
  }
  const top = run(["--help"]);
  assert.equal(top.status, 0);
  for (const cmd of COMMANDS) assert.match(top.stdout, new RegExp(`^  ${cmd} `, "m"));
  const r = spawnSync(process.execPath, [CLI, "check", "--dir", empty], { env: { ...process.env, ...ENV }, input: "y\n", encoding: "utf8", timeout: 5000 });
  assert.equal(r.status, 1, "does not wait for input");
});

test("init adds skills/agent-kit by default; --no-skill opts out", () => {
  const reg = fixture().registry;
  const fresh = () => mkdtempSync(join(tmpdir(), "agent-kit-init-"));
  const a = fresh();
  assert.equal(json(["init", "--registry", reg, "--dir", a]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(a, "agents.json"), "utf8")).add, { skills: ["agent-kit"] });
  assert.match(readFileSync(join(a, ".claude/skills/agent-kit/SKILL.md"), "utf8"), /^---\nname: agent-kit\ndescription: /);
  const b = fresh();
  json(["init", "--registry", reg, "--no-skill", "--dir", b]);
  assert.deepEqual(JSON.parse(readFileSync(join(b, "agents.json"), "utf8")).add, {});
  const bare = fixture().registry;
  const index = JSON.parse(readFileSync(join(bare, "registry.json"), "utf8"));
  delete index.skills["agent-kit"];
  writeFileSync(join(bare, "registry.json"), JSON.stringify(index));
  const c = json(["init", "--registry", bare, "--dir", fresh()]);
  assert.equal(c.status, 0);
  assert.match(c.out.warnings[0], /has no skills\/agent-kit/);
});

test("an agent with only --json and the skill gets through init, add, check and remove", () => {
  const reg = fixture().registry;
  const dir = join(reg, "..", "fresh");
  const env: Record<string, string> = { GITHUB_PERSONAL_ACCESS_TOKEN: "" };
  const step = (...a: string[]) => json([...a, "--dir", dir], env).out;
  let r = step("check");
  assert.equal(r.problems[0].code, "manifest-missing");
  assert.ok(step("init", "--registry", "../registry").ok);
  r = step("add", "rules/reakt");
  const hint = /did you mean (\S+)\?/.exec(r.problems[0].message)![1]!;
  assert.ok(step("add", hint, "mcp/github").ok);
  r = step("check");
  assert.deepEqual(r.problems.map((p: { code: string }) => p.code), ["env-missing"]);
  env.GITHUB_PERSONAL_ACCESS_TOKEN = /export (\w+)=/.exec(r.problems[0].fix)![1]!;
  assert.ok(step("check").ok);
  assert.ok(step("remove", "mcp/github", hint).ok);
  assert.ok(step("check").ok);
  assert.ok(!existsSync(join(dir, ".mcp.json")) || !("github" in JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers));
});

test("check warns that cursor lists skills twice only when cursor and claude are both targets", () => {
  const dup = (w: string) => w.startsWith("cursor lists each skill twice");
  for (const [targets, warns] of [[["cursor", "claude"], true], [["cursor", "codex"], false], [["claude", "codex"], false]] as const) {
    const { project } = fixture({ targets });
    assert.equal(run(["update", "--dir", project]).status, 0);
    const r = json(["check", "--dir", project]);
    assert.equal(r.status, 0, `${targets}`);
    assert.equal(r.out.warnings.some(dup), warns, `${targets}`);
  }
});
