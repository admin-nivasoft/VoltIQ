#!/usr/bin/env bash
# Run build steps unattended with Claude Code in headless mode, one step at a time.
# It stops at the first step that doesn't finish as `done` or whose independent check fails.
#
#   scripts/claude-build.sh            # every remaining step
#   scripts/claude-build.sh 3 5        # steps 3 to 5
#   MODEL_OVERRIDE=sonnet EFFORT_OVERRIDE=low scripts/claude-build.sh 9 10   # force a cheaper run
#
# Model and effort come from each step's "Run with:" line in docs/build-steps.md.
# Don't export CLAUDE_CODE_EFFORT_LEVEL: it overrides both --effort and the agents' own effort.
#
# Needs: the claude CLI signed in, pnpm, Docker running, a clean git working tree.
set -euo pipefail
cd "$(dirname "$0")/.."

FROM="${1:-1}"; TO="${2:-10}"
MAX_TURNS="${MAX_TURNS:-300}"
mkdir -p .claude/logs
if [ -n "${CLAUDE_CODE_EFFORT_LEVEL:-}" ]; then
  echo "CLAUDE_CODE_EFFORT_LEVEL is set; it would override every per-step and per-agent effort. Unset it first." >&2; exit 1
fi

step_run() { awk -v n="$1" -v k="$2" '$0 ~ "^## Step "n" " {f=1; next} f && /^Run with:/ {for(i=1;i<=NF;i++) if (index($i,k"=")==1) {print substr($i,length(k)+2); exit}}' docs/build-steps.md; }
step_status() { awk -v n="$1" '$0 ~ "^## Step "n" " {f=1; next} f && /^Status:/ {print $2; exit}' docs/build-steps.md; }

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree not clean. Commit or stash first." >&2; exit 1
fi

for n in $(seq "$FROM" "$TO"); do
  if [ "$(step_status "$n")" = "done" ]; then echo "Step $n already done, skipping."; continue; fi

  model="${MODEL_OVERRIDE:-$(step_run "$n" model)}"; model="${model:-sonnet}"
  effort="${EFFORT_OVERRIDE:-$(step_run "$n" effort)}"; effort="${effort:-medium}"
  log=".claude/logs/step-$n-$(date +%Y%m%d-%H%M%S).json"
  echo "==> Step $n: running Claude on $model at $effort effort (log: $log)"
  # Each step is a fresh headless session, so no context carries over between steps.
  claude -p "/build-step $n" \
    --model "$model" \
    --effort "$effort" \
    --permission-mode acceptEdits \
    --max-turns "$MAX_TURNS" \
    --output-format json > "$log" || { echo "Claude exited with an error on step $n. See $log" >&2; exit 1; }

  status="$(step_status "$n")"
  if [ "$status" != "done" ]; then
    echo "Step $n finished with status '$status'. See the Blockers section in docs/build-steps.md and $log" >&2; exit 1
  fi

  # Independent check: don't take Claude's word for it
  echo "==> Step $n: independent check"
  pnpm -s lint && pnpm -s typecheck && pnpm -s test:unit || { echo "Independent check failed after step $n." >&2; exit 1; }
  if [ "$n" -ge 2 ]; then pnpm -s test:integration || { echo "Integration tests failed after step $n." >&2; exit 1; }; fi

  echo "==> Step $n done: $(git log -1 --pretty=%s)"
done

echo "All requested steps done. Review with: git log --oneline main..build/scr-04 and /review in Claude Code"
