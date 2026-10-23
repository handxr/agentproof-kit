import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { check, sync, update } from "../src/project.ts";
import { ENV, fixture, snapshot, writeJson, issues } from "./helpers.ts";

const LINK = "-> ../../.agents/skills/code-review";
const setTargets = (project: string, targets: string[]) =>
  writeJson(join(project, "agents.json"), { ...JSON.parse(readFileSync(join(project, "agents.json"), "utf8")), targets });
const skillPaths = (project: string) => Object.keys(snapshot(project)).filter((p) => p.includes("skills/code-review")).sort();

test("skills are written once to .agents/skills, with a per-skill link only for claude", () => {
  for (const targets of [["cursor"], ["codex"], ["cursor", "codex"]]) {
    const { project } = fixture({ targets });
    update(project);
    assert.deepEqual(skillPaths(project), [".agents/skills/code-review/SKILL.md", ".agents/skills/code-review/checklist.md"], targets.join());
  }
  const { project } = fixture({ targets: ["cursor", "claude", "codex"] });
  update(project);
  assert.deepEqual(skillPaths(project), [".agents/skills/code-review/SKILL.md", ".agents/skills/code-review/checklist.md", ".claude/skills/code-review"]);
  assert.equal(snapshot(project)[".claude/skills/code-review"], LINK);
  assert.match(readFileSync(join(project, ".claude/skills/code-review/SKILL.md"), "utf8"), /name: code-review/);
  assert.equal(JSON.parse(readFileSync(join(project, "agents.lock"), "utf8")).files[".claude/skills/code-review"], "link:../../.agents/skills/code-review");
});

test("hand-written skills in .claude/skills stay, and a same-name clash stops before writing", () => {
  const { project } = fixture({ targets: ["claude"] });
  mkdirSync(join(project, ".claude/skills/mine"), { recursive: true });
  writeFileSync(join(project, ".claude/skills/mine/SKILL.md"), "mine\n");
  update(project);
  assert.equal(snapshot(project)[".claude/skills/mine/SKILL.md"], "mine\n");

  const other = fixture({ targets: ["claude"] }).project;
  mkdirSync(join(other, ".claude/skills/code-review"), { recursive: true });
  writeFileSync(join(other, ".claude/skills/code-review/SKILL.md"), "mine\n");
  assert.throws(() => update(other), /\.claude\/skills\/code-review: already exists/);
  assert.equal(snapshot(other)["agents.lock"], undefined);
  assert.equal(snapshot(other)[".claude/skills/code-review/SKILL.md"], "mine\n");
});

test("check reports a missing or repointed link, and sync restores it idempotently", () => {
  const { project } = fixture({ targets: ["claude"] });
  update(project);
  const link = join(project, ".claude/skills/code-review");
  rmSync(link);
  assert.ok(issues(check(project, ENV)).includes("drift: .claude/skills/code-review missing"));
  sync(project);
  assert.equal(snapshot(project)[".claude/skills/code-review"], LINK);
  rmSync(link);
  symlinkSync("../elsewhere", link);
  assert.ok(issues(check(project, ENV)).some((p) => p.startsWith("drift: .claude/skills/code-review points to ../elsewhere")));
  sync(project);
  assert.equal(snapshot(project)[".claude/skills/code-review"], LINK);
  assert.deepEqual(sync(project), []);
  assert.ok(!issues(check(project, ENV)).some((p) => p.startsWith("drift")));
});

test("dropping claude or a skill removes its link; the old per-target copy migrates to a link", () => {
  const { project } = fixture({ targets: ["cursor", "claude"] });
  update(project);
  setTargets(project, ["cursor"]);
  update(project);
  assert.deepEqual(skillPaths(project), [".agents/skills/code-review/SKILL.md", ".agents/skills/code-review/checklist.md"]);
  assert.equal(snapshot(project)["CLAUDE.md"], undefined);

  setTargets(project, ["claude"]);
  update(project);
  const m = JSON.parse(readFileSync(join(project, "agents.json"), "utf8"));
  writeJson(join(project, "agents.json"), { ...m, remove: { ...m.remove, skills: ["code-review"] } });
  update(project);
  assert.equal(snapshot(project)[".claude/skills/code-review"], undefined);
});

test("a previous lock with a real .claude/skills copy is replaced by the link", () => {
  const { project } = fixture({ targets: ["claude"] });
  update(project);
  const lockPath = join(project, "agents.lock");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  rmSync(join(project, ".claude/skills/code-review"));
  mkdirSync(join(project, ".claude/skills/code-review"), { recursive: true });
  writeFileSync(join(project, ".claude/skills/code-review/SKILL.md"), "old copy\n");
  delete lock.files[".claude/skills/code-review"];
  lock.files[".claude/skills/code-review/SKILL.md"] = "sha256-old";
  writeFileSync(lockPath, JSON.stringify(lock));
  update(project);
  assert.equal(snapshot(project)[".claude/skills/code-review"], LINK);
});

test("CLAUDE.md imports AGENTS.md: created when absent, line added to a hand-written file, rest untouched", () => {
  const { project } = fixture({ targets: ["claude"] });
  update(project);
  assert.equal(readFileSync(join(project, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /## Rules/);
  assert.deepEqual(update(project), []);

  const other = fixture({ targets: ["claude"] }).project;
  writeFileSync(join(other, "CLAUDE.md"), "# Mine\n\nKeep this.\n");
  update(other);
  assert.equal(readFileSync(join(other, "CLAUDE.md"), "utf8"), "# Mine\n\nKeep this.\n\n@AGENTS.md\n");
  writeFileSync(join(other, "CLAUDE.md"), "# Mine\n\nKeep this.\n");
  assert.ok(issues(check(other, ENV)).includes('drift: CLAUDE.md line "@AGENTS.md" missing'));
  sync(other);
  setTargets(other, ["cursor"]);
  update(other);
  assert.equal(readFileSync(join(other, "CLAUDE.md"), "utf8"), "# Mine\n\nKeep this.\n");
});

test("claude gets rules from AGENTS.md, not .claude/rules", () => {
  const { project } = fixture({ targets: ["claude"] });
  update(project);
  assert.ok(!Object.keys(snapshot(project)).some((p) => p.startsWith(".claude/rules/")));
});
