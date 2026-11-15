# Plan (Grok owns this file)

Status: **current slice is the Dashboard flood desk.** No dashboard model code exists yet. The tests below are red on purpose. Do not edit them. Do not send a real SMS, call, or alert. Do not change `src/proxy.ts` or `tests/clerk-gate.test.ts`. The full formula contract is `docs/grok/brief-dashboard.md`.

## Feature: dashboard flood desk

Tests, all expected red until the modules exist:

- `tests/model-gumbel.test.ts` — yearly maxima (drop a year with fewer than 300 valid days), L-moments, Gumbel fit, quantile and return period as inverses, 40-year cap, Weibull rank.
- `tests/model-severity.test.ts` — normal below 2, watch from 2, warning from 5, severe from 20. Fewer than 10 maxima is `unknown` and `returnPeriod` is null.
- `tests/model-rise.test.ts` — zero at or below bankfull, about 2.48 m at five times bankfull, zero when the input is not usable.
- `tests/model-terrarium.test.ts` — Terrarium decode, Kathmandu tile `z12 x=3018 y=1719`, ground resolution, 4 to 9 tiles for a 10 km window.
- `tests/model-hand.test.ts` — V valley depths `[0, 1, 3, 1, 0]` at a 3 m rise, a pit behind a ridge stays dry until the rise clears it, no stream stays dry, one column, flat plain, seed is the largest stream in range.
- `tests/model-flood.test.ts` — Open-Meteo URL, 9 neighbour cells with the click first, null discharge kept, API error thrown, largest mean cell, nearest tie, empty river is null.
- `tests/api-flood.test.ts` — signed out is 401, bad coordinates are 400, a signed-in flood response includes attribution with Open-Meteo and GloFAS, `/api/dem` allows zoom 10–14 only.
- `tests/alerts.test.ts` — simulated copy starts with `SIMULATION ONLY:`, plain ASCII, no WEA/NWS wording, unknown history says "not enough". Only an admin advances `detected → verified → notified → acknowledged`. A real alert cannot be notified.
- `tests/alerts-schema.test.ts` — `flood_alerts` and `flood_alert_events` in the schema.
- `tests/replay.test.ts` — `validateReplay` plus `public/geo/nepal-2026/replay.json`.
- `tests/dashboard-page.test.ts` — page shell uses Suspense and `ListSkeleton`, the map loader is client-only, Live / Replay modes, LIVE / REPLAY / SIMULATION badges, and the six disclaimers.

Assumptions locked by those tests: every year with fewer than 300 valid days is dropped. Neighbour cells are ±0.05 degrees. A signed-out data route returns 401.

## Feature: instant tab content

Dashboard stays the "Coming soon" page. It has no database call and needs no skeleton.

Missing People and Communities should paint their real title, search box, and forms as soon as the tab changes. Only the result list waits on Supabase, and that wait shows a card skeleton.

### Behavior 1 — shared list skeleton

File: `tests/tab-loading.test.ts`.

- Add `src/components/ListSkeleton.tsx`. `ListSkeleton` renders `aria-busy="true"` and the text `Loading records`. Use it for three card-shaped placeholders.

### Behavior 2 — route loading shells

- Add `src/app/missing/loading.tsx`. It shows the heading `Missing Persons Registry` and `ListSkeleton`. It must not fetch data.
- Add `src/app/communities/loading.tsx`. It shows the heading `Community Awareness Programs` and `ListSkeleton`. It must not fetch data.
- These files are what Next.js shows the instant a tab link is clicked.

### Behavior 3 — pages paint before the query

- `src/app/missing/page.tsx` keeps the header, search form, and report panel. Move `searchMissing` into a child server component (for example `src/app/missing/MissingResults.tsx`) wrapped in `<Suspense fallback={<ListSkeleton />}>`. The page file must not `await searchMissing`. Awaiting `searchParams` is fine.
- `src/app/communities/page.tsx` keeps the header, host panel, search form, and category chips. Move `auth()` and `listPrograms` into a child (for example `src/app/communities/ProgramResults.tsx`) wrapped in `<Suspense fallback={<ListSkeleton />}>`. The page file must not `await listPrograms` or `await auth(`.
- The category chips must be `next/link` `Link`s, not `<a>` tags, so a category click uses the same instant shell. Keep the current query-string behavior (`q` and `category`).
- Leave `src/proxy.ts` and the Dashboard page alone. Leave `force-dynamic` on the routes if the results must stay fresh. Do not cache or skip the Supabase query.

### Out of scope

Clerk session checks, the database queries themselves, and the flood map.

## Feature: Clerk login and logout

Auth0 and the home-grown phone+password session are retired. Clerk is the only sign-in. The app already has the pages and the proxy. These tests lock that. Do not edit the tests.

### Behavior 1 — session gate

File: `tests/clerk-gate.test.ts`.

- `clerkMiddleware` calls `auth.protect()` for `/`, `/dashboard`, `/missing`, and `/communities`.
- It does not call `auth.protect()` for `/sign-in`, `/sign-in/factor-one`, `/sign-up`, `/api/sms`, or `/geo/place.json`.
- Public patterns are exactly `/sign-in(.*)`, `/sign-up(.*)`, `/api/sms(.*)`, `/geo/(.*)`.
- The proxy matcher still includes `/(api|trpc)(.*)` and skips `_next`.
- `package.json` dependencies must not include `@auth0/nextjs-auth0`. This assertion is red until that dependency is removed. Remove the package only. Do not read `.env`.

### Behavior 2 — sign-in and sign-up

File: `tests/clerk-sign-in.test.ts`. Logic lives in `src/lib/auth-forms.ts`. Pages are `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx`.

- `toIdentifier` keeps a trimmed email, turns a US phone into E.164, and returns null for a bad email, a non-phone, or a non-US number.
- `passwordProblem` requires 8 characters with a letter and a number.
- `validateSignUp` accepts a complete valid form, requires consent, and requires the confirmation to match.
- `splitName('Ada Lovelace King')` is `{ firstName: 'Ada', lastName: 'Lovelace King' }`.
- `destinationAfterAuth` uses `redirect_url` only when it is a same-origin path that is not `/` or `/sign-…`. Otherwise it returns `/dashboard`.
- The sign-in page shows `SIGN IN` and links to `/sign-up`. The sign-up page shows `CREATE ACCOUNT`, links to `/sign-in`, and has `id="clerk-captcha"`.

### Behavior 3 — sign-out

File: `tests/clerk-sign-out.test.ts`.

- The root layout wraps the app in `ClerkProvider`.
- `UserButton` is rendered inside `<Show when="signed-in">`. That button is the sign-out control.
- The layout does not post to `/api/auth/logout` or link to `/auth/logout`.

### Out of scope

Flood map, SMS commands, linking a Clerk user id to `users.phone`, and enabling phone OTP in the Clerk dashboard.

## Deferred: flood status for a clicked map point

Do not write these tests or this code until the Clerk tests are green.

The dashboard will show a Leaflet map. A click asks our server, `GET /api/flood?lat=&lng=`, which calls the Open-Meteo Flood API (`https://flood-api.open-meteo.com/v1/flood`). No browser call to Open-Meteo. No Python model. Attribution: "Flood data: Open-Meteo.com / Copernicus GloFAS". `public/geo/` is empty.

Details to specify later: coordinate checks, a 3×3 river-cell search, levels `none | watch | warning | severe` against historical annual maxima, cache, and the response `{ snapped, level, peakDate, peakDischarge, series }`. Code would live in `src/model/`, `src/app/api/flood/route.ts`, and `src/app/dashboard/`.
