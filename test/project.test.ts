import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseMcp } from "../src/parse.ts";
import { check, sync, update } from "../src/project.ts";
import { ENV, fixture, snapshot, writeJson, issues } from "./helpers.ts";

test("sync is idempotent: a second run changes nothing", () => {
  const { project } = fixture();
  update(project);
  const first = snapshot(project);
  assert.deepEqual(sync(project), []);
  assert.deepEqual(sync(project), []);
  assert.deepEqual(snapshot(project), first);
});

test("sync restores an edited or deleted generated file", () => {
  const { project } = fixture();
  update(project);
  const before = snapshot(project);
  writeFileSync(join(project, ".mcp.json"), "{}");
  assert.deepEqual(sync(project), [".mcp.json"]);
  assert.deepEqual(snapshot(project), before);
});

test("update after a registry change produces a lock diff; sync alone refuses", () => {
  const { project, registry } = fixture();
  update(project);
  const lockBefore = JSON.parse(readFileSync(join(project, "agents.lock"), "utf8"));
  appendFileSync(join(registry, "rules/react.md"), "Prefer server components.\n");
  const reg = JSON.parse(readFileSync(join(registry, "registry.json"), "utf8"));
  reg.rules.react.version = "1.1.0";
  writeJson(join(registry, "registry.json"), reg);

  assert.throws(() => sync(project), /rules\/react: registry content differs/);
  assert.match(issues(check(project, ENV)).join("\n"), /registry-changed: rules\/react: registry content differs/);

  const changed = update(project);
  const lockAfter = JSON.parse(readFileSync(join(project, "agents.lock"), "utf8"));
  assert.ok(changed.includes("agents.lock"));
  assert.ok(changed.includes(".cursor/rules/react.mdc"));
  assert.equal(lockAfter.pieces["rules/react"].version, "1.1.0");
  assert.notEqual(lockAfter.pieces["rules/react"].hash, lockBefore.pieces["rules/react"].hash);
  assert.deepEqual({ ...lockAfter.pieces, "rules/react": null }, { ...lockBefore.pieces, "rules/react": null });
  assert.equal(check(project, ENV).ok, true);
});

test("update removes files for pieces that left the manifest", () => {
  const { project } = fixture();
  update(project);
  writeJson(join(project, "agents.json"), { ...JSON.parse(readFileSync(join(project, "agents.json"), "utf8")), remove: { hooks: ["format-on-edit"], agents: ["explorer"] } });
  const changed = update(project);
  assert.ok(changed.includes("- .cursor/agents/explorer.md"));
  assert.equal(snapshot(project)[".claude/agents/explorer.md"], undefined);
});

test("check passes on a clean project", () => {
  const { project } = fixture();
  update(project);
  assert.deepEqual(issues(check(project, ENV)), []);
});

test("check fails on drift", () => {
  const { project } = fixture();
  update(project);
  appendFileSync(join(project, ".cursor/rules/react.mdc"), "local edit\n");
  writeFileSync(join(project, "AGENTS.md"), readFileSync(join(project, "AGENTS.md"), "utf8").replace("One component per file.", "Many components."));
  const { ok, problems } = check(project, ENV);
  assert.equal(ok, false);
  assert.deepEqual(problems.map((p) => `${p.code}: ${p.message}`), ["drift: .cursor/rules/react.mdc edited", "drift: AGENTS.md managed section"]);
});

test("check fails on a missing env var", () => {
  const { project } = fixture();
  update(project);
  const { ok, problems } = check(project, { CONTEXT7_API_KEY: "y" });
  assert.equal(ok, false);
  assert.deepEqual(problems.map((p) => `${p.code}: ${p.message}`), ["env-missing: GITHUB_PERSONAL_ACCESS_TOKEN not set (needed by mcp/github)"]);
});

test("check fails on an outdated lock; unsupported pieces are warnings with exit 0", () => {
  const { project } = fixture();
  update(project);
  writeJson(join(project, "agents.json"), { ...JSON.parse(readFileSync(join(project, "agents.json"), "utf8")), add: { commands: ["ship"] } });
  assert.match(issues(check(project, ENV)).join("\n"), /pieces out of date/);
  update(project);
  const r = check(project, ENV);
  assert.deepEqual(r.problems, []);
  assert.ok(r.warnings.includes("unsupported: codex: commands/ship (commands not supported)"));
  const cli = spawnSync(process.execPath, [join(import.meta.dirname, "../src/cli.ts"), "check", "--dir", project], { env: { ...process.env, ...ENV } });
  assert.equal(cli.status, 0, cli.stderr.toString());
  assert.match(cli.stderr.toString(), /warning: unsupported: codex: commands\/ship/);
});

test("AGENTS.md keeps hand-written text outside the markers", () => {
  const { project } = fixture();
  writeFileSync(join(project, "AGENTS.md"), "# Mine\n\nKeep me.\n");
  update(project);
  update(project);
  const text = readFileSync(join(project, "AGENTS.md"), "utf8");
  assert.ok(text.startsWith("# Mine\n\nKeep me.\n\n<!-- agent-kit:start -->"));
  assert.equal(text.split("<!-- agent-kit:start -->").length, 2);
});

test("mcp pieces reject env values", () => {
  assert.throws(() => parseMcp({ command: "x", env: { TOKEN: "secret" } }, "mcp/x"), /NAMES, not values/);
});

test("git registry: update pins a commit, sync stays on it", () => {
  const { root, registry, project } = fixture();
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: registry, stdio: "pipe" }).toString().trim();
  git("init", "-q", "-b", "main"); git("add", "."); git("commit", "-qm", "v1");
  const v1 = git("rev-parse", "HEAD");
  process.env.AGENT_KIT_CACHE = join(root, "cache");
  writeJson(join(project, "agents.json"), { ...JSON.parse(readFileSync(join(project, "agents.json"), "utf8")), registry: `git:${registry}#main` });
  update(project);
  assert.equal(JSON.parse(readFileSync(join(project, "agents.lock"), "utf8")).registry.commit, v1);

  appendFileSync(join(registry, "rules/react.md"), "v2\n"); git("commit", "-qam", "v2");
  assert.deepEqual(sync(project), []);
  assert.equal(check(project, ENV).ok, true);
  update(project);
  assert.equal(JSON.parse(readFileSync(join(project, "agents.lock"), "utf8")).registry.commit, git("rev-parse", "HEAD"));
  assert.match(readFileSync(join(project, ".cursor/rules/react.mdc"), "utf8"), /v2/);
});
