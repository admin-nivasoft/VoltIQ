---
description: Build one step from docs/build-steps.md end to end (implement, test, review, commit)
argument-hint: <step number, or "next">
---

Build step **$ARGUMENTS** of the SCR-04 build. If the argument is `next` or empty, use the first step whose status isn't `done`.

## 1. Load context
- Read `CLAUDE.md`, `docs/plan-amendments.md`, the relevant sections of `docs/architecture-plan.md`, and this step in `docs/build-steps.md`.
- Check that every earlier step is `done`. If one isn't, stop and report which.
- Make sure you're on the branch `build/scr-04`; create it from the current branch if it doesn't exist. If the working tree has uncommitted changes you didn't make, stop and report them.
- Set this step's status to `in-progress`.

## 2. Plan
- Write a todo list: one item per deliverable and one per acceptance check.
- Note which amendments (D-nn) apply to this step.

## 3. Implement
- Follow the non-negotiables in CLAUDE.md.
- For tenant scoping, permissions and auth, write the failing test first, then the code.
- Keep to this step's scope. If you find something needed from a later step, write a minimal stub and note it under "Decisions taken".

## 4. Verify
- Run every acceptance command for this step, plus `pnpm lint && pnpm typecheck && pnpm test:unit`.
- Fix the cause of each failure. Never skip, `.only`, delete or weaken a test or assertion to get green. If a test is genuinely wrong, say why in the commit message.
- Tick each acceptance box only after its check has passed.

## 5. Review
Run these subagents on the diff for this step (`git diff` against the previous step's commit) and fix every Blocker and High finding. Each agent runs on the model and effort in its own file; don't override them, and send them the diff range rather than file contents:
- `tenant-security-reviewer`: always, for any step that touches `apps/api`, `db` or `packages/contracts`.
- `frontend-a11y-reviewer`: for steps 7, 8 and 9.
- `test-engineer`: ask it to find untested paths in this step's code and add the tests.

After fixing, run step 4 again. Run reviewers again only if the fixes changed more than the lines they flagged.

## 6. Finish
- Set the status to `done`, or to `blocked` with a note under Blockers if something outside your control stops you.
- Commit everything with the message `step N: <title>` and a body listing the D-nn amendments applied. Do not push.
- Reply with a short summary: what was built, the checks run and their results, the reviewer findings and how each was resolved, and any decisions or blockers.
