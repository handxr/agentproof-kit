// Formats: docs/formats.md#cursor
import { renderFrontmatter } from "../parse.ts";
import type { Adapter, GeneratedFile } from "../types.ts";
import { file, json, ofType, plainMarkdown, skillFiles, unsupportedTypes } from "./shared.ts";

const supports = new Set(["skills", "mcp", "rules", "commands", "agents", "hooks", "permissions"] as const);
const EVENTS = { preShell: "beforeShellExecution", postEdit: "afterFileEdit" } as const;

export const cursor: Adapter = {
  target: "cursor",
  supports,
  render(pieces) {
    const files: Array<[string, GeneratedFile]> = [...skillFiles(pieces, ".agents/skills"), ...plainMarkdown(pieces, "commands", ".cursor/commands")];
    const unsupported = unsupportedTypes(pieces, supports, "cursor");
    const warnings: string[] = [];

    const mcp = ofType(pieces, "mcp");
    if (mcp.length) {
      const servers = Object.fromEntries(mcp.map(({ id, body: { server: s } }) => [id,
        s.kind === "stdio"
          ? { command: s.command, args: s.args, ...(s.env.length ? { env: Object.fromEntries(s.env.map((n) => [n, `\${env:${n}}`])) } : {}) }
          : { url: s.url, ...(s.bearerTokenEnv ? { headers: { Authorization: `Bearer \${env:${s.bearerTokenEnv}}` } } : {}) },
      ]));
      files.push([".cursor/mcp.json", json({ mcpServers: servers })]);
    }

    for (const { id, body: r } of ofType(pieces, "rules")) {
      files.push([`.cursor/rules/${id}.mdc`, file(renderFrontmatter({ description: r.description, globs: r.globs, alwaysApply: r.alwaysApply }) + r.body)]);
    }
    for (const { id, body: a } of ofType(pieces, "agents")) {
      files.push([`.cursor/agents/${id}.md`, file(renderFrontmatter({ name: a.name, description: a.description, model: a.model, readonly: a.readonly || null }) + a.body)]);
    }

    const hooks = ofType(pieces, "hooks");
    if (hooks.length) {
      const byEvent: Record<string, Array<{ command: string }>> = {};
      for (const { body: h } of hooks) {
        (byEvent[EVENTS[h.event]] ??= []).push({ command: `.cursor/hooks/${h.scriptName}` });
        files.push([`.cursor/hooks/${h.scriptName}`, file(h.script, true)]);
      }
      files.push([".cursor/hooks.json", json({ version: 1, hooks: byEvent })]);
    }

    // CLI permissions take Shell(<commandBase>). Only single-word commands map without guessing at argument syntax.
    const perms = ofType(pieces, "permissions");
    if (perms.length) {
      const allow: string[] = [], deny: string[] = [];
      for (const { key, body: p } of perms) {
        for (const [list, out] of [[p.allow, allow], [p.deny, deny]] as const) {
          for (const cmd of list) cmd.includes(" ") ? warnings.push(`cursor: ${key} "${cmd}" (only single-word commands map to Shell())`) : out.push(`Shell(${cmd})`);
        }
        for (const cmd of p.ask) warnings.push(`cursor: ${key} ask "${cmd}" (no ask list in .cursor/cli.json)`);
      }
      if (allow.length || deny.length) files.push([".cursor/cli.json", json({ permissions: { allow, deny } })]);
    }
    return { files: new Map(files), agentsMd: "", unsupported, warnings };
  },
};
