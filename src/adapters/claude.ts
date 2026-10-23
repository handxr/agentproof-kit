// Formats: docs/formats.md#claude-code
import { renderFrontmatter } from "../parse.ts";
import type { Adapter, GeneratedFile, JsonEntry, PieceType } from "../types.ts";
import { entries, file, item, key, ofType, plainMarkdown, rulesSection, unsupportedTypes } from "./shared.ts";

const supports = new Set(["skills", "mcp", "rules", "commands", "agents", "hooks", "permissions"] as const);
// No documented personal location for commands: they were merged into skills.
const userSupports = new Set<PieceType>(["skills", "mcp", "rules", "agents", "hooks", "permissions"]);
const EVENTS = { preShell: { event: "PreToolUse", matcher: "Bash" }, postEdit: { event: "PostToolUse", matcher: "Edit|Write" } } as const;
const bash = (cmd: string) => [`Bash(${cmd})`, `Bash(${cmd} *)`];

export const claude: Adapter = {
  target: "claude",
  supports,
  render(pieces, scope = "project") {
    const user = scope === "user";
    const files: Array<[string, GeneratedFile]> = user ? [] : [...plainMarkdown(pieces, "commands", ".claude/commands")];

    // Claude reads only .claude/skills. Link each skill to the one copy in .agents/skills, so hand-written skills stay beside them.
    for (const { id } of ofType(pieces, "skills")) files.push([`.claude/skills/${id}`, { kind: "link", target: `../../.agents/skills/${id}` }]);
    // Rules live in the AGENTS.md section. Claude reads AGENTS.md only through an import when a CLAUDE.md exists.
    // In user scope the section goes straight into ~/.claude/CLAUDE.md, so no import is needed.
    if (!user) files.push(["CLAUDE.md", { kind: "lines", lines: ["@AGENTS.md"] }]);

    const mcp = ofType(pieces, "mcp");
    if (mcp.length) {
      const servers = mcp.map(({ id, body: { server: s } }) => key(["mcpServers", id],
        s.kind === "stdio"
          ? { command: s.command, args: s.args, ...(s.env.length ? { env: Object.fromEntries(s.env.map((n) => [n, `\${${n}}`])) } : {}) }
          : { type: "http", url: s.url, ...(s.bearerTokenEnv ? { headers: { Authorization: `Bearer \${${s.bearerTokenEnv}}` } } : {}) },
      ));
      files.push([user ? ".claude.json" : ".mcp.json", entries(servers)]);
    }

    for (const { id, body: a } of ofType(pieces, "agents")) {
      files.push([`.claude/agents/${id}.md`, file(renderFrontmatter({ name: a.name, description: a.description, model: a.model, tools: a.readonly ? "Read, Grep, Glob" : null }) + a.body)]);
    }

    const settings: JsonEntry[] = [];
    const hooks = ofType(pieces, "hooks");
    if (hooks.length) {
      for (const { body: h } of hooks) {
        const { event, matcher } = EVENTS[h.event];
        settings.push(item(["hooks", event], { matcher, hooks: [{ type: "command", command: `"${user ? "$HOME" : "$CLAUDE_PROJECT_DIR"}"/.claude/hooks/${h.scriptName}` }] }));
        files.push([`.claude/hooks/${h.scriptName}`, file(h.script, true)]);
      }
    }
    const perms = ofType(pieces, "permissions");
    for (const list of ["allow", "ask", "deny"] as const) {
      for (const rule of new Set(perms.flatMap((p) => p.body[list].flatMap(bash)))) settings.push(item(["permissions", list], rule));
    }
    if (settings.length) files.push([".claude/settings.json", entries(settings)]);
    return { files: new Map(files), agentsMd: rulesSection(pieces), unsupported: unsupportedTypes(pieces, user ? userSupports : supports, "claude"), warnings: [] };
  },
};
