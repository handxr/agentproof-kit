import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { update } from "../src/project.ts";
import { fixture, snapshot, writeJson } from "./helpers.ts";

const skillRoots = (targets: string[]) => {
  const { project } = fixture({ targets });
  update(project);
  return [...new Set(Object.keys(snapshot(project)).filter((p) => p.endsWith("/code-review/SKILL.md")))].sort();
};

test("each skill is written once per directory the targets need", () => {
  assert.deepEqual(skillRoots(["cursor", "claude"]), [".claude/skills/code-review/SKILL.md"]);
  assert.deepEqual(skillRoots(["cursor"]), [".agents/skills/code-review/SKILL.md"]);
  assert.deepEqual(skillRoots(["cursor", "codex"]), [".agents/skills/code-review/SKILL.md"]);
  assert.deepEqual(skillRoots(["cursor", "claude", "codex"]), [".agents/skills/code-review/SKILL.md", ".claude/skills/code-review/SKILL.md"]);
});

test("switching targets removes the copy no target needs any more", () => {
  const { project } = fixture({ targets: ["cursor"] });
  update(project);
  assert.ok(".agents/skills/code-review/SKILL.md" in snapshot(project));
  writeJson(join(project, "agents.json"), { ...JSON.parse(readFileSync(join(project, "agents.json"), "utf8")), targets: ["cursor", "claude"] });
  update(project);
  const after = snapshot(project);
  assert.equal(after[".agents/skills/code-review/SKILL.md"], undefined);
  assert.ok(".claude/skills/code-review/SKILL.md" in after);
});
