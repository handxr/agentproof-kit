// Formats: docs/formats.md#claude-code
import { renderFrontmatter } from "../parse.ts";
import type { Adapter, GeneratedFile } from "../types.ts";
import { file, json, ofType, plainMarkdown, skillFiles, unsupportedTypes } from "./shared.ts";

const supports = new Set(["skills", "mcp", "rules", "commands", "agents", "hooks", "permissions"] as const);
const EVENTS = { preShell: { event: "PreToolUse", matcher: "Bash" }, postEdit: { event: "PostToolUse", matcher: "Edit|Write" } } as const;
const bash = (cmd: string) => [`Bash(${cmd})`, `Bash(${cmd} *)`];

export const claude: Adapter = {
  target: "claude",
  supports,
  render(pieces) {
    const files: Array<[string, GeneratedFile]> = [...skillFiles(pieces, ".claude/skills"), ...plainMarkdown(pieces, "commands", ".claude/commands")];

    const mcp = ofType(pieces, "mcp");
    if (mcp.length) {
      const servers = Object.fromEntries(mcp.map(({ id, body: { server: s } }) => [id,
        s.kind === "stdio"
          ? { command: s.command, args: s.args, ...(s.env.length ? { env: Object.fromEntries(s.env.map((n) => [n, `\${${n}}`])) } : {}) }
          : { type: "http", url: s.url, ...(s.bearerTokenEnv ? { headers: { Authorization: `Bearer \${${s.bearerTokenEnv}}` } } : {}) },
      ]));
      files.push([".mcp.json", json({ mcpServers: servers })]);
    }

    // Claude reads only `paths` from rule frontmatter. A rule without globs always loads.
    for (const { id, body: r } of ofType(pieces, "rules")) {
      files.push([`.claude/rules/${id}.md`, file((r.globs.length ? renderFrontmatter({ paths: r.globs }) : "") + r.body)]);
    }
    for (const { id, body: a } of ofType(pieces, "agents")) {
      files.push([`.claude/agents/${id}.md`, file(renderFrontmatter({ name: a.name, description: a.description, model: a.model, tools: a.readonly ? "Read, Grep, Glob" : null }) + a.body)]);
    }

    const settings: Record<string, unknown> = {};
    const hooks = ofType(pieces, "hooks");
    if (hooks.length) {
      const byEvent: Record<string, Array<{ matcher: string; hooks: Array<{ type: "command"; command: string }> }>> = {};
      for (const { body: h } of hooks) {
        const { event, matcher } = EVENTS[h.event];
        (byEvent[event] ??= []).push({ matcher, hooks: [{ type: "command", command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/${h.scriptName}` }] });
        files.push([`.claude/hooks/${h.scriptName}`, file(h.script, true)]);
      }
      settings.hooks = byEvent;
    }
    const perms = ofType(pieces, "permissions");
    if (perms.length) {
      settings.permissions = {
        allow: perms.flatMap((p) => p.body.allow.flatMap(bash)),
        ask: perms.flatMap((p) => p.body.ask.flatMap(bash)),
        deny: perms.flatMap((p) => p.body.deny.flatMap(bash)),
      };
    }
    if (Object.keys(settings).length) files.push([".claude/settings.json", json(settings)]);
    return { files: new Map(files), agentsMd: "", unsupported: unsupportedTypes(pieces, supports, "claude"), warnings: [] };
  },
};
