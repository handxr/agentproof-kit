import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { add, init, update } from "../src/project.ts";
import { fixture, snapshot, writeJson } from "./helpers.ts";

const clashing = { mcpServers: { github: { command: "my-github" } } };


test("a failed init leaves the project exactly as it was", () => {
  const { root } = fixture();
  const project = mkdtempSync(join(root, "fresh-"));
  writeJson(join(project, ".mcp.json"), clashing);
  const before = snapshot(project);
  assert.throws(() => init(project, { registry: "../registry", presets: ["frontend"], add: {}, remove: {}, targets: ["cursor", "claude", "codex"] }), /already exists and agent-kit did not write it/);
  assert.deepEqual(snapshot(project), before);
});

test("a failed add leaves agents.json and every file unchanged", () => {
  const { project } = fixture({ presets: ["base"], remove: {} });
  update(project);
  const mcp = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf8"));
  writeJson(join(project, ".mcp.json"), { mcpServers: { ...mcp.mcpServers, context7: { command: "my-context7" } } });
  const before = snapshot(project);
  assert.throws(() => add(project, ["mcp/context7"]), /context7 already exists and agent-kit did not write it/);
  assert.deepEqual(snapshot(project), before);
});

test("init writes agents.json on success", () => {
  const { root } = fixture();
  const project = mkdtempSync(join(root, "fresh-"));
  const changed = init(project, { registry: "../registry", presets: ["base"], add: {}, remove: {}, targets: ["claude"] });
  assert.ok(changed.includes("agents.json"));
  assert.throws(() => init(project, { registry: "../registry", presets: [], add: {}, remove: {}, targets: ["claude"] }), /already exists/);
  rmSync(project, { recursive: true });
});
