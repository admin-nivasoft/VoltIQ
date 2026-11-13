# Claude Code setup for 82V QualityLoop (SCR-04)

This kit turns the architecture plan and its audit fixes into a Claude Code workflow. Claude builds one step at a time; hooks block unsafe changes; review agents check each step; and a script can run the steps unattended.

## What's in the kit

| Path | Purpose |
| --- | --- |
| `CLAUDE.md` | Project rules Claude reads every session: stack, commands, the 10 non-negotiables |
| `docs/architecture-plan.md` | Your original plan |
| `docs/plan-amendments.md` | The audit fixes as binding decisions D-01 to D-15 |
| `docs/build-steps.md` | 10 steps with acceptance checks and status; Claude keeps it current |
| `.claude/commands/build-step.md` | `/build-step N`: implement, test, review and commit one step |
| `.claude/commands/review.md` | `/review`: all reviewers on a diff; report only |
| `.claude/commands/verify.md` | `/verify`: every test layer, the Compose stack and requirement traceability |
| `.claude/agents/*.md` | tenant-security-reviewer, frontend-a11y-reviewer, test-engineer, requirements-auditor |
| `.claude/hooks/guard.mjs` | Blocks `.env` access, edits to applied migrations, RLS weakening, supplier/cohort fields, DB imports outside the data layer, `git push`, merges and destructive commands |
| `.claude/hooks/post-edit.mjs` | Prettier and ESLint on every edited file; lint errors go straight back to Claude |
| `.claude/hooks/stop-gate.mjs` | Claude can't finish with uncommitted code that fails typecheck or unit tests |
| `.claude/hooks/session-context.mjs` | Tells each new session which step is next |
| `.claude/settings.json` | Permission allow/deny lists and hook registration |
| `.mcp.json` | Playwright MCP, so Claude can open the running app and look at it |
| `scripts/claude-build.sh` | Runs steps headlessly, with an independent check after each |
| `.github/workflows/claude-review.yml` | Claude reviews every pull request against the same checklists |

## One-time setup

1. **Install the prerequisites:** Node 22, pnpm 9 or later (`corepack enable`), Docker Desktop, Git, and Claude Code (`npm install -g @anthropic-ai/claude-code`). Then run `claude` once to sign in.
2. **Create the repository and copy the kit in:**
   ```bash
   mkdir 82v-qualityloop && cd 82v-qualityloop && git init -b main
   # unzip the kit here so CLAUDE.md sits at the repo root
   chmod +x scripts/claude-build.sh
   git add -A && git commit -m "chore: Claude Code kit, plan and amendments"
   ```
3. **Check that Claude Code sees everything.** Start `claude` in the repo and run:
   - `/hooks`: the four hooks are listed.
   - `/agents`: the four agents are listed.
   - `/mcp`: playwright is connected. Approve it the first time.
   - Type `/` to see `build-step`, `review` and `verify`.
4. **Windows:** run Claude Code from Git Bash or WSL. The hooks are Node scripts, so they work in both.

## Day-to-day: supervised (recommended for steps 1–3)

```text
claude
> /build-step 1
```
Watch the first steps; they set the patterns everything else copies. After each step, read the diff (`git show`) and the reviewer findings in Claude's summary. Correct anything you dislike in `CLAUDE.md` or `docs/plan-amendments.md` before moving on, so later steps inherit the fix.

Other useful prompts:
- `/build-step next`: continue from wherever the build is.
- `/review`: get a second opinion on everything since `main`.
- "Use the test-engineer agent on apps/api/src/modules/alerts": fill test gaps in one module.
- "Open http://localhost:8080 with playwright at 390 px and check the fleet screen": a visual check.

## Unattended: steps 4–10

Once steps 1–3 look right:
```bash
scripts/claude-build.sh 4 10        # or with no arguments for every remaining step
```
The script runs `claude -p "/build-step N"` with `acceptEdits` permissions. Any shell command outside the allow-list in `.claude/settings.json` is refused rather than prompting. After each step the script runs lint, typecheck and tests itself, and it stops at the first failure or blocked step. Logs go to `.claude/logs/`. Afterwards, review `git log main..build/scr-04` and open a PR. Nothing is pushed or merged for you.

## Token and cost controls

Nothing in this kit runs at the top levels. The project settings cap effort at `high` (`maxEffortLevel`), so `xhigh` and `max` never run, even if an agent or a command asks for them. Opus is used only where a mistake leaks one consumer's data to another.

### Who runs on what

| Where | Model | Effort | Why |
| --- | --- | --- | --- |
| Main session default (`.claude/settings.json`) | Sonnet | medium | Everyday building |
| Steps 2–3: database RLS, auth, policy | Opus | high | Tenant isolation is designed here |
| Step 4: data layer | Sonnet | high | Interfaces everything else copies |
| Steps 1, 5–8 | Sonnet | medium | Following set patterns |
| Steps 9–10: settings, containers, docs | Sonnet | low | Routine work |
| `tenant-security-reviewer` | Opus | high | The one review that must not miss |
| `test-engineer`, `frontend-a11y-reviewer` | Sonnet | medium | |
| `requirements-auditor` | Sonnet | low | Tracing and grepping |
| Built-in agents (Explore and others) | Sonnet | low | Set by `CLAUDE_CODE_SUBAGENT_MODEL` and `CLAUDE_CODE_SUBAGENT_EFFORT` |

`scripts/claude-build.sh` reads each step's `Run with:` line and passes `--model` and `--effort` for you. Each step also runs as a fresh session, so no context carries over between steps.

### Commands to use when working interactively

Start each step in a new session, with the model and effort from its `Run with:` line:
```bash
claude --model opus --effort high      # steps 2-3
claude --model sonnet --effort medium  # most steps
claude --model sonnet --effort low     # steps 9-10, small fixes, docs
```

Inside a session:

| Command | When to use it |
| --- | --- |
| `/clear` | Between steps, and whenever you switch to an unrelated task. Old context is otherwise re-sent on every turn. |
| `/compact keep step N status, open checks and failing tests` | When a step runs long. `CLAUDE.md` already holds default compact instructions, so a plain `/compact` keeps the right things. |
| `/effort low` or `/effort medium` | Drop effort for mechanical work (renames, lint fixes, docs) without a restart. |
| `/context` | See what is filling the context window (large files, MCP tools). |
| `/usage` (subscription) or `/cost` (API key) | See spend; on paid plans it breaks usage down by subagent. |
| `/model` | Avoid switching mid-session if you can. Each model has its own cache, so the whole conversation is re-read at full price on the next turn. Pick the model at launch instead. |

### Things that silently undo these settings

- **`CLAUDE_CODE_EFFORT_LEVEL` in your shell profile.** It overrides `--effort`, `/effort`, the settings and the agents' own effort. The build script refuses to run while it is set. Check with `echo $CLAUDE_CODE_EFFORT_LEVEL`.
- **Your user settings (`~/.claude/settings.json`).** Project settings override user settings, but personal overrides in `.claude/settings.local.json` win over both.
- **Asking for "max effort" in a prompt.** Claude can raise a subagent's effort when you ask, but the `high` cap still applies.

### Cheaper still, if needed

- Run steps 5–8 on `--effort low` with `EFFORT_OVERRIDE=low scripts/claude-build.sh 5 8`, and raise effort only for a step that fails.
- Set `requirements-auditor` to `model: haiku` in its frontmatter. Its work is mostly tracing.
- Disconnect the Playwright MCP (`/mcp`) when you aren't doing visual checks. Its tool definitions take up context on every turn.

## Pull request review in CI

1. Add `ANTHROPIC_API_KEY` as a repository secret. Alternatively, run `/install-github-app` inside Claude Code, which installs the GitHub app and sets up the secret.
2. Push `build/scr-04` and open a PR. Claude posts a findings table and a tenant-isolation verdict.
3. Step 10 builds the normal CI workflow (lint, tests, e2e, images) alongside this one.

## Adjusting the guardrails

- **A hook blocks something legitimate:** edit the rule in `.claude/hooks/guard.mjs`. Don't remove the hook.
- **Claude keeps asking permission for a safe command:** add it to `permissions.allow` in `.claude/settings.json`.
- **A rule is personal rather than for the team:** put it in `.claude/settings.local.json` (git-ignored).
- **You change a decision:** edit `docs/plan-amendments.md` and say so in your next prompt. Claude treats that file as binding.

## Open decisions that need you, not Claude

These are flagged in D-11 and in the README that step 10 writes:
- Should technicians see alerts and manage their own channels? The role matrix is silent.
- Is a global role policy acceptable, or do consumers need their own?
- The placeholder values: near end of life under 6 months, trend threshold -0.5 points per 30 days, warranty "Expiring" under 90 days.
