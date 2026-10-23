#!/usr/bin/env bash
# Generate the example project into a temp dir and ask each real agent CLI what it loaded.
# Only checks that need no login run. Each CLI gets an empty, throwaway home so user config
# on this machine cannot leak in. Env values are dummies: we only test that names are wired.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# macOS has no `timeout`; perl's alarm does the same job. Resolve /var -> /private/var so Codex's trust key matches.
command -v timeout >/dev/null || timeout() { local s=$1; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
CURSOR=$(command -v cursor-agent || command -v "$HOME/.local/bin/cursor-agent" || command -v agent || true)
TMP=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/examples/registry" "$TMP/registry"
mkdir "$TMP/project" && cd "$TMP/project" && git init -q
node "$ROOT/src/cli.ts" init --registry ../registry --preset frontend >/dev/null || { echo "FAIL: agent-kit init"; exit 1; }
export GITHUB_PERSONAL_ACCESS_TOKEN=smoke-dummy CONTEXT7_API_KEY=smoke-dummy
fails=0
ok()   { echo "  ok: $1"; }
bad()  { echo "  FAIL: $1"; fails=$((fails + 1)); }
skip() { echo "  skipped: $1"; }
has()  { grep -q -- "$2" <<<"$1"; }
servers() { local out=$1 what=$2; for s in github context7; do has "$out" "$s" && ok "$what lists MCP server $s" || bad "$what does not list MCP server $s"; done; }

echo "== Claude Code $(claude --version 2>/dev/null || echo 'not installed')"
if command -v claude >/dev/null; then
  export CLAUDE_CONFIG_DIR="$TMP/claude-home"; mkdir -p "$CLAUDE_CONFIG_DIR"
  out=$(timeout 60 claude mcp list </dev/null 2>&1); echo "$out" | sed 's/^/    /'
  servers "$out" "claude mcp list (.mcp.json)"
  has "$out" "Pending approval" && echo "  note: project MCP servers stay 'Pending approval' until approved in an interactive session"
  doc=$(timeout 60 claude doctor </dev/null 2>&1)
  if has "$doc" "Invalid settings"; then echo "$doc" | sed -n '/Invalid settings/,/^$/p' | sed 's/^/    /'; bad "claude doctor reports invalid settings"; else ok "claude doctor: .claude/settings.json (hooks, permissions) and .mcp.json valid"; fi
  unset CLAUDE_CONFIG_DIR
  skip "skills, subagents, rules loaded by Claude: needs login (model call)"
else bad "claude not installed"; fi

echo "== Codex $(codex --version 2>/dev/null || echo 'not installed')"
if command -v codex >/dev/null; then
  export CODEX_HOME="$TMP/codex-home"; mkdir -p "$CODEX_HOME"
  out=$(timeout 60 codex mcp list 2>&1 | grep -v '^WARNING')
  has "$out" "No MCP servers" && ok "untrusted project: .codex/ ignored, as documented" || bad "untrusted project loaded .codex/"
  # Documented trust key; the same entry Codex writes when you answer its trust prompt.
  printf '[projects."%s"]\ntrust_level = "trusted"\n' "$(pwd -P)" > "$CODEX_HOME/config.toml"
  out=$(timeout 60 codex mcp list 2>&1 | grep -v '^WARNING'); echo "$out" | sed 's/^/    /'
  servers "$out" "codex mcp list (.codex/config.toml, trusted)"
  has "$out" "GITHUB_PERSONAL_ACCESS_TOKEN" && ok "env_vars forwarded by name" || bad "env_vars not shown"
  has "$out" "CONTEXT7_API_KEY" && ok "bearer_token_env_var read" || bad "bearer_token_env_var not shown"
  unset CODEX_HOME
  skip "skills, subagents, hooks, rules loaded by Codex: needs login (model call)"
else bad "codex not installed"; fi

echo "== Cursor CLI $([ -n "$CURSOR" ] && "$CURSOR" --version 2>/dev/null || echo 'not installed')"
if [ -n "$CURSOR" ]; then
  out=$(HOME="$TMP/cursor-home" timeout 60 "$CURSOR" mcp list </dev/null 2>&1); echo "$out" | sed 's/^/    /'
  servers "$out" "cursor-agent mcp list (.cursor/mcp.json)"
  has "$out" "needs approval" && echo "  note: project MCP servers need approval (cursor-agent mcp enable <id> or --approve-mcps)"
  skip "skills, rules, subagents, hooks, permissions loaded by Cursor: needs login (model call)"
else bad "cursor-agent not installed"; fi

echo
[ "$fails" -eq 0 ] && echo "smoke: ok" || echo "smoke: $fails failure(s)"
exit $((fails > 0))
