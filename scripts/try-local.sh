#!/usr/bin/env bash
# Try agent-kit on your own machine: unit tests, the no-login smoke test, then one cheap model
# call per agent CLI you are logged in to, checking it names the example skills.
# Usage: bash scripts/try-local.sh [path/to/unpacked/agent-kit]
set -uo pipefail
ROOT=$(cd "${1:-$(dirname "$0")/..}" && pwd -P)
SKILLS=(code-review react-component)
PROMPT="List the names of the skills you have loaded, one per line, names only. Do not run any tools."
command -v timeout >/dev/null || timeout() { local s=$1; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }

major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$major" -ge 24 ] || { echo "need Node >= 24 (found $(node --version 2>/dev/null || echo none))"; exit 1; }
echo "== node $(node --version), agent-kit at $ROOT"

(cd "$ROOT" && npm test >/tmp/agent-kit-test.log 2>&1) && echo "  ok: npm test ($(grep -E '^ℹ pass' /tmp/agent-kit-test.log))" || { echo "  FAIL: npm test, see /tmp/agent-kit-test.log"; exit 1; }
(cd "$ROOT" && npm run --silent smoke) || { echo "  FAIL: npm run smoke"; exit 1; }

TMP=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/examples/registry" "$TMP/registry"
mkdir "$TMP/project" && cd "$TMP/project" && git init -q
node "$ROOT/src/cli.ts" init --registry ../registry --preset frontend >/dev/null || { echo "FAIL: agent-kit init"; exit 1; }
echo "== model calls in $TMP/project (one short prompt per logged-in CLI)"

fails=0
expect() {
  local what=$1 out=$2
  [ -z "$out" ] && { echo "  FAIL: $what returned nothing"; fails=$((fails + 1)); return; }
  echo "$out" | sed 's/^/    /'
  for s in "${SKILLS[@]}"; do
    grep -qi -- "$s" <<<"$out" && echo "  ok: $what names skill $s" || { echo "  FAIL: $what does not name skill $s"; fails=$((fails + 1)); }
  done
}

if ! command -v claude >/dev/null; then echo "  skipped: claude not installed"
elif claude auth status 2>/dev/null | grep -q '"loggedIn": *true' || [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  expect "claude -p ($(claude --version))" "$(timeout 180 claude -p "$PROMPT" --output-format text </dev/null 2>&1)"
else echo "  skipped: claude not logged in (run: claude, then /login; or claude auth status)"; fi

if ! command -v codex >/dev/null; then echo "  skipped: codex not installed"
elif codex login status >/dev/null 2>&1; then
  expect "codex exec ($(codex --version))" "$(timeout 180 codex exec --cd "$PWD" --sandbox read-only --ephemeral --skip-git-repo-check "$PROMPT" </dev/null 2>/dev/null)"
else echo "  skipped: codex not logged in (run: codex login)"; fi

CURSOR=$(command -v cursor-agent || command -v "$HOME/.local/bin/cursor-agent" || command -v agent || true)
if [ -z "$CURSOR" ]; then echo "  skipped: Cursor CLI (cursor-agent or agent) not installed"
elif ! "$CURSOR" status </dev/null 2>&1 | grep -qi "not logged in"; then
  expect "$(basename "$CURSOR") -p ($("$CURSOR" --version 2>/dev/null))" "$(timeout 180 "$CURSOR" -p --trust --workspace "$PWD" --output-format text "$PROMPT" </dev/null 2>&1)"
else echo "  skipped: Cursor CLI not logged in (run: $(basename "$CURSOR") login)"; fi

echo
[ "$fails" -eq 0 ] && echo "try-local: ok" || echo "try-local: $fails failure(s)"
exit $((fails > 0))
