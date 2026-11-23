---
description: Redesign the quality loop project into the revised BPTE product, using sub agents for dev and testing
argument-hint: [optional focus, for example "docs only"]
---
You are the lead for redesigning the Closed-Loop Quality platform into the revised BPTE product. Read bpte/CLAUDE.md first. Do not reuse anything from the old station, swap or rider direction. Focus (if given): $ARGUMENTS

PRODUCT
One record per battery through its life: (1) Birth: factory data into a passport; (2) Ops: BMS field data plus deployment; (3) Dashboard: both for the battery manager. The battery ID joins them. This is the foundation (M1 and M2). M3 to M6 are deferred, not deleted.

RULES
- Inspect the repo and docs first. Report what exists.
- Never invent facts or numbers. Mark unknowns [__].
- Keep deferred requirement IDs, marked "Later".
- Medallion architecture: bronze raw, silver matched and cleaned, gold calculated and versioned. Manufacturer ID on every record.
- Ask me before choosing a data platform or table format. Present options.
- Small commits. Stay inside the project.

PHASE 1: PLAN (you only, no sub agents)
Write bpte/PLAN.md: current state, what changes, what is deferred, the work split, the order, and the model for each agent. Stop and show me the plan.

PHASE 2: AGENTS (after I approve the plan)
Each agent is defined in .claude/agents/ with its own model. Do not override the model unless I say so. Before spawning, state the agent count and model for each, and wait for my OK.
Order:
1. data-model-agent (opus). Wait for it to finish.
2. In parallel: docs-agent, pipeline-agent, api-agent, dashboard-agent.
3. test-data-agent, then in parallel: pipeline-test-agent, tenant-test-agent, e2e-test-agent.
4. review-agent last.

TOKEN RULES
- Give each agent file paths, not pasted documents.
- Agents report in 15 lines or fewer.
- Max 2 fix rounds per agent, then report the blocker to me.
- Do not re-read large documents already summarised in bpte/PLAN.md.

PHASE 3: INTEGRATE
Merge, run all tests, then review-agent. Write bpte/STATUS.md: done, failing, unverified, assumptions, open questions, and the decisions that need me (platform and table format first).

DONE MEANS
Docs and code agree with each other and with bpte/CLAUDE.md. All tests pass, or each failure has a reason. No invented numbers. Deferred features are marked Later.
