# 82V QualityLoop · Fleet Health (SCR-04)

Mock-first build of the consumer fleet health portal. Read these before any non-trivial change:

1. `docs/architecture-plan.md`: the agreed plan (Nov 13, 2026).
2. `docs/plan-amendments.md`: **binding fixes from the audit. Where they conflict with the plan, the amendments win.**
3. `docs/build-steps.md`: the ordered build, with status and acceptance checks per step.

## Stack (fixed: do not substitute)

- pnpm workspaces monorepo, Node 22, TypeScript strict everywhere (`"strict": true`, `noUncheckedIndexedAccess`).
- `apps/web`: Vite, React 18, Tailwind, TanStack Query, React Router.
- `apps/api`: Fastify, Kysely on `pg`, zod. SQL migrations with node-pg-migrate in `db/migrations`.
- `packages/contracts`: zod schemas and inferred types, shared by api and web; OpenAPI produced with `@asteasolutions/zod-to-openapi`. The web app imports types from contracts directly (no generated client).
- PostgreSQL 16. Tests: Vitest, Testing Library, Playwright with `@axe-core/playwright`, Testcontainers for Postgres.

## Commands (the root package.json must provide these; hooks depend on them)

| Command | What it does |
| --- | --- |
| `pnpm lint` | ESLint, including the data-boundary import rule |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test:unit` | Fast tests, no database |
| `pnpm test:integration` | API and database tests against a Postgres container |
| `pnpm test:e2e` | Playwright against the Compose stack |
| `pnpm build` | Build every package |
| `pnpm verify` | lint, typecheck, test:unit, test:integration, build, in order |
| `pnpm db:reset` | Drop, migrate and seed the local database |

## Non-negotiables

These are checked by hooks and reviewers. Breaking one is a blocker, not a style issue.

1. **The consumer comes from the verified token only.** It never comes from a URL, query or body, except in the documented mock-only exceptions in amendment D-04.
2. **Every tenant query runs inside `withTenant(consumerId, fn)`.** It opens a transaction and calls `set_config('app.consumer_id', $1, true)`. Never use plain `SET`, and never query tenant tables outside it.
3. **RLS is never weakened.** No `BYPASSRLS`, no `DISABLE ROW LEVEL SECURITY`, no `NO FORCE`. The app connects as `ql_app`, which owns nothing.
4. **Internal quality data never enters this portal.** No supplier, cohort, cell lot or cell-level columns, fields or strings in `db/`, `packages/contracts` or API responses.
5. **Data boundary.** Only `apps/api/src/data/**` may import `pg`, `kysely` or a vendor SDK. ESLint `no-restricted-imports` enforces it.
6. **Responses are whitelisted DTOs** built from contracts schemas (`schema.parse` on the way out). Never spread a database row into a response.
7. **Another consumer's resource returns 404, not 403.** A missing permission returns 403.
8. **Status is never shown by colour alone.** Severity, trend and warranty status always have text and an icon.
9. **Mock features fail closed.** Mock login and `/dev/*` exist only when `AUTH_PROVIDER=mock` and `ENABLE_DEV_ENDPOINTS=true` are set explicitly.
10. **Applied migrations are immutable.** Change the schema with a new migration.

## Conventions

- Timestamps are `timestamptz` and are returned as ISO strings. IDs are UUIDs.
- Errors use the shape `{ "error": { "code", "message", "details"? } }`. Lists take `page`, `pageSize` (default 25, max 100) and `sort`, and return `total`. Every response has `asOf`.
- `sort` values are checked against a per-endpoint allow-list. Search input has `%` and `_` escaped before `ILIKE`.
- Placeholder values (near-EOL months, trend threshold, severities) live in `apps/api/src/config.ts`, read from env with defaults. Never hard-code them in logic.
- Feature folders: `apps/web/src/features/{fleet,alerts,packs,settings}`, `apps/api/src/modules/{access,fleet,alerts,notifications,audit}`, `apps/api/src/data/`.
- Write tests with the code. Security-critical code (tenant scoping, permissions, auth) gets its failing test first.

## Working rules for Claude

- Work one build step at a time with `/build-step N`. Don't start work from a later step early.
- Never run `git push`, never merge, and never edit `.env` files. `.env.example` is fine.
- If the plan or amendments are ambiguous, choose the option that is safer for tenant isolation. Record it under "Decisions taken" in `docs/build-steps.md` and continue.
- Keep `docs/build-steps.md` current: tick acceptance checks only after running them.

## Token use

- Each subagent has its own model and effort in its frontmatter. Don't pass a model or a higher effort when you invoke one, unless the user asks.
- Use the built-in Explore agent for broad searches across the repo, rather than reading many files in the main session.
- Read the specific section of a doc you need (use the headings), not whole files, when you only need one decision.
- Keep command output short: use `--reporter=dot` for Vitest and `--quiet` for ESLint, and use `tail` on long logs.
- Don't reread files you've just written. Don't restate the plan back in replies.

## Compact instructions

When compacting, keep: the current step number and status, the acceptance checks still open, the D-nn amendments in play, the files changed in this step, and any failing test names with their errors. Drop file contents that are already committed, and passing test output.
