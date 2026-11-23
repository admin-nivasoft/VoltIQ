---
description: Docs-first pass. Rework the docs and data model only, then review. No code or test agents.
argument-hint: [optional focus]
---
Read bpte/CLAUDE.md. Do the docs-first part of the BPTE redesign. Focus (if given): $ARGUMENTS

1. Write bpte/PLAN.md: what changes in the docs, what is deferred, and what you will ask the agents to do. Stop and show me.
2. After I approve: run data-model-agent (opus), then docs-agent (sonnet).
3. Run review-agent (sonnet) last.
Rules: never invent numbers; mark unknowns [__]; keep deferred IDs marked "Later"; agents report in 15 lines or fewer; max 2 fix rounds; give agents file paths, not pasted text.
Write bpte/STATUS.md with done, unverified, open questions and decisions that need me.
