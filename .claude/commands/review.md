---
description: Run all reviewers on the current diff or a given ref range and report findings by severity
argument-hint: [git range, default: changes since main]
---

Review the changes in `$ARGUMENTS`. If no range is given, use `main...HEAD` plus any uncommitted changes.

1. Run the `tenant-security-reviewer` and `frontend-a11y-reviewer` subagents in parallel on those changes. Then run `requirements-auditor` on the whole repository.
2. Merge their findings into one table, sorted Blocker > High > Medium > Low, with the columns: severity, file:line, finding, fix.
3. Do **not** change any code. End by asking whether to fix the Blocker and High items.
