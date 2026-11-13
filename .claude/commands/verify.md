---
description: Full verification - every test layer, the Compose stack, and the requirement traceability check
---

1. Run `pnpm verify`. If it fails, report the failure and stop.
2. Run `docker compose up -d --build`, wait for `http://localhost:8080/api/v1/readyz` to return 200, then run `pnpm test:e2e`.
3. Run the `requirements-auditor` subagent.
4. Run `docker compose down`.
5. Report a table with one row per check (pass or fail, and its duration), followed by the auditor's coverage table. Do not change any code.
