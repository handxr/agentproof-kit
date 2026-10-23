#!/usr/bin/env bash
# Reads the hook payload on stdin. Exits 2 to block a force push.
if grep -Eq 'git push.*(--force|-f)( |"|$)'; then
  echo "Force push blocked by agentproof-kit hook" >&2
  exit 2
fi
exit 0
