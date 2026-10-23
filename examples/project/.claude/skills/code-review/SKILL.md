---
name: code-review
description: Review a diff for correctness bugs, risky changes and missing tests. Use when asked to review a PR, a branch or staged changes.
---

# Code review

1. Read the diff with `git diff main...HEAD`.
2. For each change, ask what breaks if the input is empty, huge or malformed.
3. Check that new behaviour has a test. Name the missing test if not.
4. Report findings by severity using `checklist.md`. Lead with anything that loses data.
