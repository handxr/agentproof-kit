// Formats: docs/formats.md#codex
import type { Adapter, GeneratedFile } from "../types.ts";
import { file, json, ofType, rulesSection, skillFiles, unsupportedTypes } from "./shared.ts";

// Custom prompts (commands) are deprecated in Codex in favour of skills, so commands stay unsupported.
const supports = new Set(["skills", "mcp", "rules", "agents", "hooks", "permissions"] as const);
const toml = (v: string | readonly string[]): string => (typeof v === "string" ? JSON.stringify(v) : `[${v.map((s) => JSON.stringify(s)).join(", ")}]`);
const DECISION = { allow: "allow", ask: "prompt", deny: "forbidden" } as const;

export const codex: Adapter = {
  target: "codex",
  supports,
  render(pieces) {
    const files: Array<[string, GeneratedFile]> = skillFiles(pieces, ".agents/skills");
    const unsupported = unsupportedTypes(pieces, supports, "codex");
    const warnings: string[] = [];

    const mcp = ofType(pieces, "mcp");
    if (mcp.length) {
      const tables = mcp.map(({ id, body: { server: s } }) =>
        [`[mcp_servers.${id}]`,
          ...(s.kind === "stdio"
            ? [`command = ${toml(s.command)}`, `args = ${toml(s.args)}`, ...(s.env.length ? [`env_vars = ${toml(s.env)}`] : [])]
            : [`url = ${toml(s.url)}`, ...(s.bearerTokenEnv ? [`bearer_token_env_var = ${toml(s.bearerTokenEnv)}`] : [])]),
        ].join("\n"));
      files.push([".codex/config.toml", file(`${tables.join("\n\n")}\n`)]);
    }

    for (const { id, key, body: a } of ofType(pieces, "agents")) {
      const lines = [`name = ${toml(a.name.replace(/-/g, "_"))}`, `description = ${toml(a.description)}`, ...(a.model ? [`model = ${toml(a.model)}`] : []), `developer_instructions = ${toml(a.body.trim())}`];
      files.push([`.codex/agents/${id}.toml`, file(`${lines.join("\n")}\n`)]);
      if (a.readonly) warnings.push(`codex: ${key} readonly (custom agents inherit the parent sandbox)`);
    }

    const hooks = ofType(pieces, "hooks");
    const pre = hooks.filter((h) => h.body.event === "preShell");
    for (const h of hooks) if (h.body.event !== "preShell") unsupported.push(`codex: ${h.key} event ${h.body.event} (edit tool matcher not verified)`);
    if (pre.length) {
      for (const { body: h } of pre) files.push([`.codex/hooks/${h.scriptName}`, file(h.script, true)]);
      files.push([".codex/hooks.json", json({ hooks: { PreToolUse: pre.map(({ body: h }) => ({ matcher: "Bash", hooks: [{ type: "command", command: `"$(git rev-parse --show-toplevel)/.codex/hooks/${h.scriptName}"` }] })) } })]);
    }

    const perms = ofType(pieces, "permissions");
    if (perms.length) {
      const rules = perms.flatMap(({ key, body: p }) =>
        (["allow", "ask", "deny"] as const).flatMap((list) => p[list].map((cmd) => `# ${key}\nprefix_rule(pattern = ${toml(cmd.split(/\s+/))}, decision = "${DECISION[list]}")`)));
      files.push([".codex/rules/agent-kit.rules", file(`${rules.join("\n")}\n`)]);
    }

    return { files: new Map(files), agentsMd: rulesSection(pieces), unsupported, warnings };
  },
};
