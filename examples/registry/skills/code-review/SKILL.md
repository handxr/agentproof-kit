---
name: code-review
description: Review a diff for correctness bugs, risky changes, and missing tests. Use when asked to review a pull request, a branch, or staged changes.
---

# Code review

1. Read the diff with `git diff main...HEAD`.
2. For each change, ask what breaks if the input is empty, huge, or malformed.
3. Check that new behavior has a test. If it has none, name the missing test.
4. Sort the findings by the severity levels in `checklist.md`. Put anything that loses data first.
