import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { check, sync, update } from "../src/project.ts";
import { ENV, fixture, writeJson } from "./helpers.ts";

const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");
const readJ = (dir: string, path: string) => JSON.parse(read(dir, path));
const manifest = (dir: string) => JSON.parse(read(dir, "agents.json"));

function withHandWritten() {
  const f = fixture();
  writeJson(join(f.project, ".mcp.json"), { mcpServers: { mine: { command: "my-server" } } });
  writeJson(join(f.project, ".claude/settings.json"), { model: "opus", permissions: { allow: ["Bash(make test)"] } });
  mkdirSync(join(f.project, ".codex"));
  writeFileSync(join(f.project, ".codex/config.toml"), '# my settings\nmodel = "o3"\n\n[mcp_servers.mine]\ncommand = "my-server"\n');
  return f;
}

test("hand-written entries survive update and sync", () => {
  const { project } = withHandWritten();
  update(project);
  assert.deepEqual(sync(project), []);
  update(project);
  const mcp = readJ(project, ".mcp.json");
  assert.deepEqual(mcp.mcpServers.mine, { command: "my-server" });
  assert.ok(mcp.mcpServers.github);
  const settings = readJ(project, ".claude/settings.json");
  assert.equal(settings.model, "opus");
  assert.equal(settings.permissions.allow[0], "Bash(make test)");
  assert.ok(settings.permissions.allow.includes("Bash(git status)"));
  const toml = read(project, ".codex/config.toml");
  assert.ok(toml.startsWith('# my settings\nmodel = "o3"\n\n[mcp_servers.mine]\ncommand = "my-server"\n'));
  assert.match(toml, /\[mcp_servers\.github\]/);
  assert.deepEqual(check(project, ENV).problems, []);
});

test("removing a piece deletes only its keys", () => {
  const { project } = withHandWritten();
  update(project);
  writeJson(join(project, "agents.json"), { ...manifest(project), remove: { hooks: ["format-on-edit"], mcp: ["github"], permissions: ["safe-git"] } });
  update(project);
  const mcp = readJ(project, ".mcp.json");
  assert.deepEqual(Object.keys(mcp.mcpServers), ["mine", "context7"]);
  assert.deepEqual(readJ(project, ".claude/settings.json").permissions, { allow: ["Bash(make test)"] });
  assert.doesNotMatch(read(project, ".codex/config.toml"), /mcp_servers\.github/);
  assert.equal(readJ(project, "agents.lock").owned[".mcp.json"].length, 1);
});

test("a shared file agent-kit created is deleted when nothing of ours is left", () => {
  const { project } = fixture();
  update(project);
  writeJson(join(project, "agents.json"), { ...manifest(project), remove: { hooks: ["format-on-edit", "block-force-push"] } });
  const changed = update(project);
  assert.ok(changed.includes("- .cursor/hooks.json"));
  assert.ok(changed.includes("- .codex/hooks.json"));
});

test("editing an owned key is drift, editing a user key is not", () => {
  const { project } = withHandWritten();
  update(project);
  const mcp = readJ(project, ".mcp.json");
  mcp.mcpServers.mine.command = "changed";
  writeJson(join(project, ".mcp.json"), mcp);
  assert.deepEqual(check(project, ENV).problems, []);

  mcp.mcpServers.github.command = "changed";
  writeJson(join(project, ".mcp.json"), mcp);
  writeFileSync(join(project, ".codex/config.toml"), read(project, ".codex/config.toml").replace('url = "https://mcp.context7.com/mcp"', 'url = "x"'));
  assert.deepEqual(check(project, ENV).problems, ["drift: .codex/config.toml [mcp_servers.context7] edited", "drift: .mcp.json /mcpServers/github edited"]);
  sync(project);
  assert.deepEqual(check(project, ENV).problems, []);
  assert.equal(readJ(project, ".mcp.json").mcpServers.mine.command, "changed");
});

test("a user key with the same name as an owned key is a clear error", () => {
  const { project } = fixture();
  writeJson(join(project, ".mcp.json"), { mcpServers: { github: { command: "my-github" } } });
  assert.throws(() => update(project), /\.mcp\.json: \/mcpServers\/github already exists and agent-kit did not write it/);
  assert.throws(() => readJ(project, "agents.lock"), /ENOENT/);
});

test("a user TOML table with the same name as an owned table is a clear error", () => {
  const { project } = fixture();
  mkdirSync(join(project, ".codex"));
  writeFileSync(join(project, ".codex/config.toml"), '[mcp_servers.github]\ncommand = "mine"\n');
  assert.throws(() => update(project), /\.codex\/config\.toml: \[mcp_servers\.github\] already exists and agent-kit did not write it/);
});
