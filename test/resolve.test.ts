import assert from "node:assert/strict";
import { test } from "node:test";
import { parseManifest, parsePreset } from "../src/parse.ts";
import { loadRegistry } from "../src/registry.ts";
import { expandPreset, resolvePieces } from "../src/resolve.ts";
import type { Preset, PresetId } from "../src/types.ts";
import { EXAMPLE_REGISTRY } from "./helpers.ts";

const reg = loadRegistry(EXAMPLE_REGISTRY, ".");
const known = new Set(reg.index.keys());
const manifest = (extra: object) => parseManifest({ registry: "x", presets: ["frontend"], ...extra });

test("frontend extends base: parents first, union of both", () => {
  const keys = expandPreset(reg.presets, "frontend" as PresetId);
  assert.ok(keys.indexOf("skills/code-review" as never) < keys.indexOf("skills/react-component" as never));
  assert.deepEqual(resolvePieces(manifest({}), reg.presets, known), [
    "agents/explorer", "hooks/block-force-push", "hooks/format-on-edit", "mcp/context7", "mcp/github", "permissions/safe-git",
    "rules/conventional-commits", "rules/react", "rules/typescript-strict", "skills/code-review", "skills/react-component",
  ]);
});

test("add and remove apply after presets", () => {
  const keys = resolvePieces(manifest({ add: { commands: ["ship"] }, remove: { mcp: ["github"] } }), reg.presets, known);
  assert.ok(keys.includes("commands/ship" as never));
  assert.ok(!keys.includes("mcp/github" as never));
});

test("diamond extends lists each piece once", () => {
  const presets = new Map<PresetId, Preset>([
    ["a" as PresetId, parsePreset({ rules: ["react"] }, "a")],
    ["b" as PresetId, parsePreset({ extends: ["a"] }, "b")],
    ["c" as PresetId, parsePreset({ extends: ["a"] }, "c")],
    ["d" as PresetId, parsePreset({ extends: ["b", "c"] }, "d")],
  ]);
  assert.deepEqual(resolvePieces(parseManifest({ registry: "x", presets: ["d"] }), presets, known), ["rules/react"]);
});

test("cycles, unknown presets and unknown pieces fail", () => {
  const presets = new Map<PresetId, Preset>([
    ["a" as PresetId, parsePreset({ extends: ["b"] }, "a")],
    ["b" as PresetId, parsePreset({ extends: ["a"] }, "b")],
  ]);
  assert.throws(() => expandPreset(presets, "a" as PresetId), /preset cycle: a -> b -> a/);
  assert.throws(() => expandPreset(presets, "nope" as PresetId), /unknown preset/);
  assert.throws(() => resolvePieces(manifest({ add: { skills: ["missing"] } }), reg.presets, known), /not in registry: skills\/missing/);
});
