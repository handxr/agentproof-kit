#!/usr/bin/env bash
# Formats the repo's changed files after an agent edit. Never blocks.
npx --no-install prettier --write $(git diff --name-only) >/dev/null 2>&1 || true
exit 0
