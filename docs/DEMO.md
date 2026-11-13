# Stakeholder demo (static, no server)

A browser-only build of the portal for showing progress. It uses made-up sample data and a small
in-browser stand-in for the API, so it needs **no API, no database and no Docker**. A yellow
**DEMO** strip across the top of every page says so. Nothing is saved: a reload (or "Reset demo")
starts again.

It is a separate build flag, not a fallback. A normal build never contains the sample data, the fake
API or the banner (`apps/web/src/bundle.test.ts` builds with the flag off and searches the output),
so a real deployment cannot show invented numbers.

## Run it on your machine

```bash
cd "/Volumes/DevStorage/82 Volts/82-QualityLoop/qualityloop-claude-kit_1" && pnpm install && pnpm demo
```

Open http://localhost:5173 and choose a demo user. Try:

- **Aurora Motors, Fleet manager:** can acknowledge alerts; the Active alerts tile drops.
- **Aurora Motors, Technician:** sees the alerts, but there is no Acknowledge button.
- **Meridian Storage Systems / Northgate Logistics:** different fleets; each company only sees its own.
- **Platform administration:** no fleet, so a plain "no access" page.

## Build the static site

```bash
cd "/Volumes/DevStorage/82 Volts/82-QualityLoop/qualityloop-claude-kit_1" && pnpm demo:build
```

The site is `apps/web/dist/`. To look at it exactly as it will be served:

```bash
cd "/Volumes/DevStorage/82 Volts/82-QualityLoop/qualityloop-claude-kit_1/apps/web" && pnpm preview:demo
```

## Put it on Vercel (free Hobby plan)

**Option 1: upload the finished folder (simplest, no Git needed).**

```bash
cd "/Volumes/DevStorage/82 Volts/82-QualityLoop/qualityloop-claude-kit_1" && pnpm demo:build && npx vercel deploy apps/web/dist --prod
```

The first run asks you to log in and name the project. The folder already contains a
`vercel.json` that sends every address to the app (needed for page refreshes and deep links).

**Option 2: connect the Git repository (updates on every push).**

1. In Vercel, import the repository and set **Root Directory** to `apps/web`. Leave "Include source
   files outside of the Root Directory" switched on, because the app uses the workspace package
   `@ql/contracts`.
2. Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK` = `1` so Vercel uses the pnpm
   version this repository pins, and choose Node 22.
3. Deploy. `apps/web/vercel.json` already sets the install command, the demo build command
   (`pnpm build:demo`), the output folder, the page rewrite, and `noindex` / security headers.

**Already deployed (this repository's demo).** The static folder was uploaded as the Vercel project
`ql-fleet-demo`; the public address is the project's production alias, `https://ql-fleet-demo.vercel.app`
(the long per-deployment addresses are protected by Vercel login, so share the short one). To publish
an update after changing the frontend:

```bash
cd "/Volumes/DevStorage/82 Volts/82-QualityLoop/qualityloop-claude-kit_1" && pnpm demo:build && rm -rf .tmp/ql-fleet-demo/assets && cp -R apps/web/dist/. .tmp/ql-fleet-demo/ && cd .tmp/ql-fleet-demo && npx vercel deploy --prod --yes
```

(`.tmp/ql-fleet-demo` holds the link to the Vercel project in its hidden `.vercel` folder and is not in
Git. On a fresh checkout, create that folder, copy `apps/web/dist` into it and run the deploy command
once; Vercel will ask you to create or link a project.)

Notes:

- The pages are marked `noindex`, so search engines are asked to skip them. Anyone with the link can
  still open it; use Vercel's password protection or "Vercel Authentication" if the link should be
  private (a paid-plan feature for production deployments).
- The Vercel setup was written to Vercel's documented behaviour but could not be tried against a
  real Vercel account here. The static site itself is tested (`pnpm test:e2e:demo`).

## Tests

```bash
cd "/Volumes/DevStorage/82 Volts/82-QualityLoop/qualityloop-claude-kit_1" && pnpm test:e2e:demo
```

Runs the demo in Chrome with no server: the banner, sign-in as each person, acknowledge, search and
sort, Reset demo, accessibility (axe) at 390, 768 and 1440 px, and a check that the page makes no
call to `/api`.
