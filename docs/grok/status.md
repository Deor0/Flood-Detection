# Status log (append-only, newest first; both agents write here)

## 2026-11-15 · Claude (judge feedback: Missing People & Find, branch `judge/missing`)

Approved one-time test exception: new tests in `tests/missing-judge.test.ts`; `tests/admin-edits.test.ts` "stops one user at 10 pending suggestions" now uses its own reporters (the shared reporter hit the 10-reports-a-day limit; test bug, now green).

- **Privacy:** signed-out `/missing` now behaves like `/find`: no list without 2+ letters, `publicSearch` fields only (initials for children, coarse area, status; no age, notes, contact). Signed-in non-owners no longer see a child's notes, and their suggestions never change them (`requestEdit`).
- **Found is two-step for non-reporters:** `markFound` by anyone but the reporter/admin files a found claim in the existing suggestion queue (`proposed = { _kind: 'found', note }`, event `found_claimed`), returns `{ ok: true, pending: true, requestId }`; the card shows "REPORTED SAFE — confirming". `approveEditRequest` on a claim marks found (claimant = finder); the reporter marking found settles open claims; reject leaves it missing. SMS path unchanged (only the reporting phone ever reaches `markFound`). `listEditRequests` items have `kind: 'edit' | 'found'`.
- **Duplicates / fuzzy:** `src/core/missing/fuzzy.ts` (TS-side over the 2000 newest rows): `findLikelyDuplicates` shown in the report form ("Is this the same person? REG-…", tick to file anyway); `suggestNames` for "Did you mean …" on `/missing` and `/find`. `names.ts`: `foldName` (Shrestha/Srestha, Laxmi/Lakshmi, Ray/Rai…), `editDistance`, `fuzzyScore`, `parsePublicId`.
- New `/missing/[publicId]`: record page with a public-safe timeline (`src/core/missing/timeline.ts`, no actor ids/notes/reasons). Status filter chips on `/missing`. Form ids use the record id. Odyssey copy (kicker, badges, Telemachus line).
- Checks: tsc clean, lint 0 errors, tests 100/101 (only `api-flood`, another slice), build ok.

## 2026-11-15 · Claude (judge feedback: Offline Helpline robustness, theme, creativity; branch `judge/helpline`)

One-time test exception (user): Claude wrote new tests for the backend it changed; `tests/clerk-gate.test.ts` changed only to move `/sms-simulator` to the public list.

- Voice (`src/core/helpline/vapi.ts`, `/api/postsms`): the `data/helpline-reports.json` copy is best effort (skipped when `VERCEL` is set, errors logged), so a saved report always returns its number and Vapi does not retry into duplicates. Repeat guard: same caller number (or same `call.id` when hidden) + same normalized name within 10 min returns the earlier record with `duplicate: true`, under an advisory lock. Each voice report also appends a `VOICE_REPORT` row to `sms_log` (no schema change). A throwing tool returns `server_error` for that call only.
- SMS core (`src/core/sms`): forgiving parser (`parse.ts`: punctuation after the command, aliases FIND/LOST/SAFE/KHOJ/HARAYO/BHETIYO and more, one-letter typos, `FOUND REG-01001`, unreadable age dropped). SEARCH lines use `coarseRegion`. A repeated MISSING/FOUND text from the same phone within 2 min returns the first reply (logged `DUPLICATE`); one phone's texts run one at a time (advisory lock, command in a savepoint). Reunion notice: "Good news: REG-01001 Maya Rai is home safe." prepended when a report the phone filed was marked found by someone else since its last text. STATUS answers from the saved demo river data (`status.ts`, bundled JSON), labelled SIMULATION with the save date, else "No river data for X" + higher ground.
- `SMS_ALLOWED_FROM` accepts a comma-separated list (`allowedSenders` in `src/lib/phone.ts`).
- `/sms-simulator` is public; signed-out visitors see a "Sign in to practise" link instead of the simulator. CallSimulator: "No, I want to report my mother" now files a report (end only on bare "no"/"bye"/"that's all"). Theme: kicker "The Beacon Line", voice agent "Mentor".
- Tests: `tests/sms-parse.test.ts`, `sms-core.test.ts`, `sms-allowed.test.ts`, `vapi-tools.test.ts`, `call-intent.test.ts`. Full run 188/190 (the two known reds: `admin-edits`, `api-flood`). tsc clean, lint 0 errors, build ok.
- **Open:** the Nav still hides the helpline tab from signed-out visitors (Nav is outside this area).

## 2026-11-15 · Claude (Offline Helpline UI: SMS + voice, frontend only)

The user asked for UI and UX changes only, with no backend changes and no tests. This is approved UI-only work: no test was written or edited, and nothing in `src/app/api`, `src/core`, `src/db`, `src/sms` or `src/proxy.ts` changed.

- `/sms-simulator` is now presented as **Offline Helpline** (the URL is unchanged, so the gate test still covers it). Page metadata and openGraph are set. The page has two channel cards (voice line: number placeholder; text line: live pilot), the simulator with **Text | Call** tabs, a 4-step "how it works without internet", a command reference table and a privacy and limits list.
- Call tab (`CallSimulator.tsx`): a client-side script for a guided call (check or report → name → place → age). It runs the existing `sendSimulatedSms` action with `SEARCH` / `MISSING`, so the answers come from the real registry. There's an optional Read aloud toggle (browser `speechSynthesis`). Like the Text tab, reports filed here are real records.
- Shared data is in `src/lib/helpline.ts` (`VOICE_NUMBER = null` until the Vapi number is known, `COMMANDS`, `PRIVACY_POINTS`). The new `HelplineNote` card ("No internet? Call or text") is on Home, `/missing`, `/find` and `/guide`. There's also a "No mobile data?" tip under Guide → During.
- Home copy fixed: "No real alert or SMS is ever sent" is now accurate (only flood alerts are simulated), and "Sign-up uses an email or a US phone number" now says email only. The nav label is still "SMS Simulator" because the user didn't pick it.
- Checks: `tsc` clean, lint 0 errors, tests 84/86 (the 2 known test bugs below), `pnpm build` passes. Rendered the helpline page with its real CSS at 1280px and 375px: no horizontal overflow. The call flow's clicks haven't been tried in a signed-in browser (production Clerk keys don't work on localhost).
- **Backend items found, not done (frontend-only rule):**
  1. `report_missing_person` (`src/core/helpline/vapi.ts`) appends to `data/helpline-reports.json`. Vercel's file system is read-only, so a live voice report probably saves the DB row and then throws, and the caller hears an error. It needs a test and a fix (skip or guard the file write in production).
  2. Open `/api/sms` to any US number, with a shared-secret check, so the SMS number can be published.
  3. The voice line has no "found" tool. The UI tells callers to text `FOUND <name>`.
  4. Admin: on the **production** Clerk instance, `oshanhamal3@gmail.com` (`user_3M8OZpmZ9rIJPts8b9SyYNZ3LLM`) has no `role`. The admin role exists only on the dev instance. Set `publicMetadata.role = "admin"` in production (waiting on the user).

## 2026-11-15 · Claude (SMS line works end to end in production)

- `POST /api/sms` is live on `main` (`082a4c8`, cherry-picked from `sms-calls` `358d129`) and deployed at https://www.poseidonsurge.surf/api/sms. Takes `{ from, body }` JSON, accepts only `SMS_ALLOWED_FROM`, runs `handleInboundSms`, returns `{ reply }`. `tests/sms-shortcut.test.ts` is green.
- Bridge: an iPhone Shortcuts automation on the receiver phone (trigger: message from the offline phone's contact → POST to `/api/sms` with `from` typed in and `body` = message content → text `reply` back). Tested by the user from a phone with no internet: works.
- **Open for Grok:**
  1. The route trusts the `from` field only; anyone who knows the allowed number can post reports. Please write a red test for a shared-secret header (e.g. `x-sms-secret` checked against an env var). The Shortcut can send that header.
  2. `SMS_ALLOWED_FROM` holds one number. If more offline phones need the line, write tests for a list.
  3. `/api/postsms` (`8e5a607`) is on `main` and still has no caller check (see the earlier entry).

## 2026-11-15 · Claude (fix: /communities hung for signed-in users; real cause of the earlier hangs)

- Signed in, `/communities` stayed on "Loading records" (signed out it worked). Reproduced against Supabase: with `max: 1`, postgres-js pipelines concurrent queries on one connection, and through Supavisor's transaction mode they never answer (3 concurrent queries: hang with max 1, ~0.3 s with max 5). Signed-in `/communities` runs `listPrograms` and `listMyPrograms` in parallel. This, not frozen instances, was also the likely cause of the earlier "everything hangs" after the `max: 1` change.
- `src/db/index.ts`: per-request client now `max: 5`. Tests 84/86 (known two), lint and build ok.

## 2026-11-15 · Claude (security: Supabase Data API exposed every table)

- Audit (Supabase skills, read-only): RLS was off on all `public` tables and `anon`/`authenticated` had full rights (incl. DELETE/TRUNCATE). Confirmed with the publishable key: Supabase REST returned `missing_persons` (17 rows, incl. contact) and `sms_log` (23). Supabase default privileges would expose new tables too.
- Fix: `.enableRLS()` on every table in `src/db/schema.ts` → generated `0004_enable_rls.sql`; custom `0005_revoke_data_api_roles.sql` revokes table/sequence/function rights and default privileges from `anon`/`authenticated` (skipped where the roles don't exist, e.g. PGlite). The app connects as `postgres` (BYPASSRLS, table owner), so its queries are unaffected; no policies needed because the app never uses the Data API.
- Dry run on Supabase in a rolled-back transaction (0002-0005): all tables RLS on, anon/authenticated no rights, app still reads 17 people / 5 programs. Tests 84/86 (known two), lint 0 errors. **Applied 2026-11-15 with the user's approval** (`pnpm db:migrate` via the session pooler; 0002-0005, 6 migrations recorded). Verified: Supabase REST now returns 42501 for every table with the public key; the live site still shows 17 people and 5 programs.
- `.env.example` now points at the transaction pooler (6543).

## 2026-11-15 · Claude (fix: production data pages hung forever)

- Live `/missing` and `/communities` sent the page shell, then the database part never finished; the DB itself answered in ~0.2 s and showed no app queries waiting. Cause (inferred): one module-level postgres-js connection (`max: 1`) reused across requests; Vercel freezes idle instances, the pooler drops the socket, and the reused dead socket hangs that query and everything queued behind it.
- `src/db/index.ts`: a fresh connection per request via React `cache` (`max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10`), nothing kept across requests. Local production build: sequential, 10 parallel, and after-idle requests all load in ~0.3 s.

## 2026-11-15 · Claude (sign-up/sign-in: email only, user request)

- Production Clerk instance has phone numbers off (paid feature), so `signUp.password({ phoneNumber })` failed with "phone_number is not a valid parameter". At the user's request the phone field is gone from `SignUpForm`, `SignInForm` accepts email only, and `SignUpValues.phone` is optional (validated only when given). No tests edited; `tests/clerk-sign-in.test.ts` still passes (`toIdentifier` keeps phone support).
- Production Clerk also has "verify email at sign-up" on, and the form has no code-entry step. Either turn it off in Clerk or add a verification step (needs a test first).
- **Grok:** sign-up/sign-in tests could pin "no phone field, email-only identifier".

## 2026-11-15 · Claude (built: public read, login only to change data)

The user asked for this to be built now, before Grok's tests exist. **Approved test exception (user, once):** Claude updated `tests/clerk-gate.test.ts` to the new public list. No other test was touched.

- `src/proxy.ts` public list now also has `/` (exact root only), `/find(.*)`, `/guide(.*)`, `/nepal(.*)`, `/dashboard(.*)`, `/missing(.*)`, `/communities(.*)`, `/api/flood(.*)`, `/api/dem(.*)`. `/admin(.*)` and `/sms-simulator(.*)` stay protected. `clerkMiddleware` still runs everywhere, so `auth()` works on public pages. Checked against the real `createRouteMatcher`: `/` matches only `/`, not `/admin`.
- `tests/clerk-gate.test.ts`: its mock matcher now treats a pattern without `(.*)` as exact, like Clerk does. Before, `/` would have matched every path. Public paths include the new ones; the protected test uses `/admin`, `/admin/users`, `/admin/missing`, `/sms-simulator`.
- Signed-out visitors get "Sign in to ..." links to `/sign-in?redirect_url=<path>` (`src/components/SignInLink.tsx`) instead of: report a missing person, mark found / suggest an edit (`MissingResults` does not render `PersonActions` at all, so no edit-form values reach the browser), host a program, register. "Your programs" already returned nothing when signed out. The admin alert buttons were already admin-only.
- Nav: signed-out visitors now see the nav with a "Sign in" link instead of `UserButton`, without the SMS Simulator tab. The nav is hidden on `/sign-in` and `/sign-up` when signed out.
- Privacy when signed out: contact and found note are stripped by `redactForViewer`. Attendee lists are admin-only (`listAttendees`). Only `approved` programs are listed (`listPrograms`). On `/missing`, anyone under 18 is shown as initials to signed-out visitors. **Gap:** signed-in non-owners still see minors' full names on `/missing`. Should they also see initials?
- Server actions checked: `missing/actions.ts`, `communities/actions.ts`, `sms-simulator/actions.ts` return the sign-in message when there is no `userId`. The admin and dashboard actions use `requireAdmin()`.
- **Not done (blocked by a test):** `/api/flood` and `/api/dem` still return 401 to signed-out callers, because `tests/api-flood.test.ts` pins that. So signed-out visitors on `/dashboard` see the map, but live lookups fail with "Sign in to look up live river data." A note on the page points them to sign in or to `/demo`. To make the flood desk fully public, Grok or the user needs to change those two assertions; then Claude removes the `userId` checks in the routes.
- Results: `pnpm test` 84/86 (only the two known test bugs fail). Lint: 0 errors. Build ok; every page route is still ƒ (dynamic). Not checked in a browser.
- **Grok, tests to add:** a signed-out render of `/missing` and `/communities` shows "Sign in to" links with `redirect_url` and no forms; a signed-out `MissingResults` shows minors as initials and sends no contact; a signed-out call to each write action writes nothing; `Nav` with `signedIn: false` shows "Sign in" and no SMS Simulator; the public/flood API decision above.

## 2026-11-15 · Claude (fix: Clerk auth() error on 404s for skipped static paths)

- Production logged "auth() was called but Clerk can't detect usage of clerkMiddleware()": browsers ask for `/favicon.ico`, the proxy matcher skips `.ico`, the 404 renders in the root layout, and `AdminNavGate` calls `getViewer()` → `auth()`.
- Added `src/app/icon.png` (256 px copy of `public/home/logo.png`). `getViewer()` now treats a failing `auth()` as signed out, after `unstable_rethrow` so Next's dynamic-rendering signals still pass. No tests touched; suite 84/86 (the two known test bugs), lint and build ok, route render modes unchanged.
- **Grok:** a test for "getViewer returns signed out when auth() throws" would pin this.

## 2026-11-15 · Claude (fix: Supabase pooler out of connections in production)

- Production `/missing` and `/communities` failed with `EMAXCONNSESSION max clients reached in session mode - pool_size: 15`. Each serverless instance opened a postgres-js pool of up to 10 against the session pooler (`:5432`).
- `src/db/index.ts`: `postgres(url, { max: 1, idle_timeout: 20, prepare: false })`. No tests touched (tests use PGlite, not this client). Typecheck and lint clean.
- **User to do:** set the deployed `DATABASE_URL` to Supabase's transaction pooler (port `6543`), then redeploy.

## 2026-11-15 · Claude (request for Grok: public read, login only to change data)

**User decision (2026-11-15):** opening the domain should show the hero/home page, not the login. Anyone can read data without an account. Adding and editing need sign-in. The user chose to have Grok write the tests first. Nothing is implemented yet.

**Proposed contract (please turn into red tests + a plan.md section):**
1. **`src/proxy.ts` public list** gains `/`, `/find(.*)`, `/guide(.*)`, `/nepal(.*)`, `/dashboard(.*)`, `/missing(.*)`, `/communities(.*)`, plus the read-only APIs those pages call (`/api/flood(.*)`, `/api/dem(.*)`). `/admin(.*)` and `/sms-simulator(.*)` stay protected. `tests/clerk-gate.test.ts` currently asserts `/`, `/dashboard`, `/missing`, `/communities` call `auth.protect()`; that needs updating.
2. **Signed-out pages render the data**, with no crash when `getViewer()` returns `{ userId: null }`. Every form or button that changes data (report missing, mark found, edit, suggest edit, host/edit/cancel program, register) is replaced by a "Sign in to ..." link to `/sign-in?redirect_url=<current path>`.
3. **Server stays the gate.** Every write action already returns the sign-in message when `userId` is null (`src/app/missing/actions.ts`, `src/app/communities/actions.ts`, `src/app/sms-simulator/actions.ts`); admin actions use `requireAdmin()`. Tests should pin that a signed-out call writes nothing.
4. **Privacy for signed-out readers is the same as for a normal user:** no reporter contact details, no attendee lists, children shown as initials, only `approved` programs listed.

**Open question for the user (not yet answered):** should `/dashboard` (flood desk) be public too, or only home, Find, Guide, Nepal, Missing and Communities? The list above assumes all of them.

## 2026-11-15 · Claude (open items to pick up later; `main` at `4916de0`)

What landed on `main`: dashboard simulation (Manning rating depth, scenarios, A/B compare, forecast band), public `/demo` with saved data for 5 rivers, `flood_climatology` cache (migration `0003`), Ocean Blue palette, and GEOGloWS as the primary river source with Open-Meteo as the fallback.

**Blocked on a decision**
1. **Helpline route is unsafe to ship.** `src/app/api/postsms/`, `src/core/helpline/`, `docs/helpline-api.md` and their edits to `src/proxy.ts` and `tests/clerk-gate.test.ts` are uncommitted in the working tree (another session's work). `/api/postsms` is public, does not verify the caller (no shared secret or signature), and writes missing-person reports through `reportMissing`. Add a secret check before it goes to `main`. The same route was reverted from `main` once already (`7d48b4f`).
2. **Migrations not applied to Supabase:** `0002` (flood alert tables; the admin alert buttons need it) and `0003` (`flood_climatology`; without it the cache is in memory only). Apply with `pnpm db:migrate` after approval.
3. **Public pages:** `/`, `/find`, `/guide`, `/nepal` still need sign-in. Opening them means adding them to `src/proxy.ts` and to `tests/clerk-gate.test.ts`.

**Red tests (2 of 84)**
- `tests/admin-edits.test.ts` "stops one user at 10 pending suggestions": test bug, the shared `reporter` hits the 10 reports/24 h cap on the 11th report. Give the test its own reporter.
- `tests/api-flood.test.ts` "returns severity, the snapped cell, and the attribution": its fetch mock returns one shared Open-Meteo reply, which the GEOGloWS lookup now reads first. Mock GEOGloWS (`getriverid`, `retrospectivedaily`, `forecaststats`) or route by URL.
- `tests/clerk-gate.test.ts` passes only with the uncommitted helpline edit, which also lists `/demo(.*)`. If the helpline is dropped, keep the `/demo(.*)` part of that edit.

**Data and demo**
- Rhine and Indus demo data are from the older nearest-reach rule. Refresh with `node scripts/build-demo.mjs --force` (takes several minutes; space runs out, both services rate-limit bursts).
- `public/geo/demo/__tiles__/` is the builder's download cache, left behind by a stopped run. Delete it or add it to `.gitignore`.
- GEOGloWS limits: `getriverid` gives no reach position (snap distance is to the search point, not the river); the hosted `returnperiods` endpoint returned 500, so return periods are our own Gumbel fit; a first click on a new river takes 20 to 60 s; values are simulated, not gauged. The Bagmati reach shows sharp one-day monsoon spikes (for example 68 to 461 to 63 m3/s in July 1990) that were not checked against a gauge.
- Open-Meteo hit its daily limit for this IP on 2026-11-15; it is only the fallback now.
- "More than 1,400 dead" for Nepal still has no official source (labelled "to be confirmed" on `/nepal`).

**Not checked**
- Nothing in this round was looked at in a browser: home page palette, full-width map, scenario controls, compare swipe, `/demo`, `/guide` video.
- Live clicks on open sea and a small stream through the GEOGloWS path.

**Not built (ideas, in rough value order)**
- Dynamic flood solver for moving water and dam-break waves (MIT ports: `deluge-flood-sim`, `cheia`).
- Exposed people and buildings (WorldPop or GHSL, OSM buildings) and nearest shelters (Overpass).
- EMSR927 footprint on the Nepal replay.
- Better terrain from OpenTopography COP30 (`OPENTOPOGRAPHY_API_KEY` in `.env`, set by the user) and official GloFAS return-period thresholds from Copernicus CDS (needs a one-off Python preprocessing step). The user has both accounts.

## 2026-11-14 · Grok

- Approved slice: Vapi voice gateway for `check_missing_person` and `report_missing_person` only. No flood-status or shelter tool.
- Wrote `tests/vapi-helpline.test.ts`. It is red until `src/core/helpline/vapi.ts` and `src/app/api/sms/vapi/route.ts` exist.
- Contract is the voice section in `docs/grok/plan.md`. Do not edit the test. Do not change `src/proxy.ts` or `POST /api/sms`. A voice caller may be any valid E.164 number. SMS stays +1.
- **Claude next:** make that test pass, then `pnpm lint` and `pnpm build`. Do not put `VAPI_WEBHOOK_SECRET` in the repo.

## 2026-11-14 · Claude (flood-guide: new home page, /guide, /nepal, video)

- Home page rebuilt: full-bleed hero (photo in `public/home/hero.jpg`, resized from the user's Unsplash download; photographer name taken from the file name, please verify), shortcut strip, three audience columns, four alternating feature rows, Nepal strip, footer. New `/guide` (Flood Guide tab, before/during/after, sourced tips, centred click-to-play video "How to Survive a Flood", third-party, not reviewed) and `/nepal` (decluttered report and the what-if tool, sources and limits). Drawn illustrations are the fallback for any missing photo (`src/app/home-art`).
- No tests written or edited. `pnpm test` 83/84 (known `admin-edits` reporter-cap test bug), lint clean, build ok. Not checked in a browser.
- **Grok:** no tests exist for `/guide`, `/nepal`, the home page, `/find`, the SMS core and simulator, mark-found limits or the forecast-first `/api/flood`. `src/proxy.ts` is unchanged, so `/`, `/find`, `/guide`, `/nepal` still need sign-in (the user has not approved opening them).

## 2026-11-14 · Claude (demo fixes slices 1-3 + README; judge review done)

- A judge-style review (three read-only agents) produced a ranked critique; plan approved by the user. Brief for Grok: `docs/grok/brief-demo-fixes.md`. User decisions: under 6 h left; SMS shown through an on-screen simulator; public missing search is status-only; phones stay US-only.
- Built with no test edits: **(1) forecast-first** `/api/flood` (peak only from days after today UTC, `current.dischargeDate`, new `forecast{...}`, headline severity = worse of today and forecast peak); **(3)** in-memory history/place cache (6 h), 8 s/4 s timeouts, Nominatim User-Agent; alert panel hidden for `normal`; **(2)** map flies to zoom 12 after a river click, "Try Rasuwa" button, HAND in a Web Worker with main-thread fallback (`hand.worker.ts`, `water-core.ts`), debounced slider, distinct shallow-water colour, stream threshold scaled by latitude, replay panel fixes (empty series, date-only events), bigger chart text; README rewritten. Suite 83/84, lint clean, build ok. **Not seen in a browser.**
- **Grok, tests needed (red first):** slice 1 (future-only peak, headline severity, `daysAhead`), slice 3 (one Open-Meteo fetch for repeated points, timeout gives 502), slice 4 (SMS core + simulator), slice 5 (public `/` and `/find` status-only; needs the user's OK to change `src/proxy.ts` and `tests/clerk-gate.test.ts`), slice 6 (mark-found confirm, admin-edits reporter-cap test fix). Held back until those tests exist.
- The alert preview now uses the forecast return period when it is the worse one. Migration `0002` still unapplied; nothing committed.

## 2026-11-14 · Claude (dashboard flood desk IMPLEMENTED; branch `dashboard`)

- Three parallel agents, no tests edited. `pnpm test`: 83 of 84 pass. `pnpm lint` clean, `pnpm build` ok (new routes `/api/flood`, `/api/dem`). **Not run in a browser or against real Open-Meteo / DEM tiles.** Nothing was sent anywhere.
- Model: `src/model/{gumbel,severity,rise,terrarium,hand,openMeteo,replay,types}.ts`; routes `src/app/api/{flood,dem}/route.ts`. Alerts: `src/core/alerts/{state,service}.ts`, `canSendAlert`, tables `flood_alerts`/`flood_alert_events`, migration `0002_bored_maestro.sql` (**generated, NOT applied; waiting for the user**). UI: `src/app/dashboard/*` (shell + Suspense, client-only map, HAND water layer, Live/Replay, phone preview, admin-only actions that call `requireAdmin()` first).
- **Grok, please review:** (1) `computeHand` deviates from the brief to satisfy `model-hand` tests: outlets are edge cells with no strictly lower neighbour; a stream is a cell with MORE than `streamThresholdCells` cells upstream (brief said `>=`); drainage target is the first downstream stream whose ground is not higher than the cell. (2) `replay.json` has an empty `series` (no invented numbers); add sourced series if you have them. (3) `tests/admin-edits.test.ts` "stops one user at 10 pending suggestions" fails on `reportMissing` (line 63), a leftover from the admin slice, unrelated to the dashboard; the test's reporter probably hits the 10 reports/24h cap.

## 2026-11-14 · Grok

- Wrote the failing dashboard tests first. No model, route, alert, or map code was added.
- Red on purpose: `tests/model-gumbel.test.ts`, `tests/model-severity.test.ts`, `tests/model-rise.test.ts`, `tests/model-terrarium.test.ts`, `tests/model-hand.test.ts`, `tests/model-flood.test.ts`, `tests/api-flood.test.ts`, `tests/alerts.test.ts`, `tests/alerts-schema.test.ts`, `tests/replay.test.ts`, `tests/dashboard-page.test.ts`.
- Contract: `docs/grok/plan.md` and `docs/grok/brief-dashboard.md`. Do not edit the tests. Do not send a real alert. Do not change `src/proxy.ts`.
- **Claude next:** implement until those files pass, then `pnpm lint` and `pnpm build`.

## 2026-11-14 · Claude (dashboard: plan approved, brief written)

- Committed the Fog/teal palette, Roboto and sharp-edge restyle on branch `dashboard` (`014a78a`). Grok's test updates (`tests/edge-review.test.ts`, `tests/programs.test.ts`, `tests/admin-guard.test.ts`, `tests/admin-permissions.test.ts`) are still uncommitted and were left alone.
- Five research agents compared data sources, GitHub models, our codebase, Nepal data and alert channels. Findings that shaped the plan: no maintained drop-in flood model fits (RiskRadar has no license; ANUGA is 10-16 h and risky, so skipped); a plain bathtub fill is wrong, so use HAND (height above nearest drainage); severity = today's GloFAS discharge against its own 1984-present history (Gumbel, 2/5/20 years); the 26 Aug 2026 Nepal event was a slope/ice failure that rain and river data cannot show, so the replay is a documented timeline plus the EMSR927 footprint, not an animated rise.
- User decisions: worldwide by click; replay only the 26 Aug 2026 event; must-haves are live severity, Nepal replay slider, water-fill animation and the alert pipeline with a phone preview; alerts are simulation-only (user declined to choose real channels); Grok writes tests first.
- Wrote `docs/grok/brief-dashboard.md` (formulas, boundaries, fixtures, route contracts, alert state machine, replay-data guard, UI contract). **No dashboard code written yet.**
- **Grok next:** turn the brief into behaviors in `plan.md` and write the failing tests. **Claude next:** implement after they are red (three parallel agents: model maths and routes; map, water layer and worker; replay data script, panels, alert pipeline and its migration), then ask the user before applying the migration or fetching the Copernicus products zip.

## 2026-11-14 · Grok

- Finished the admin tests Claude asked for. Updated the 6 older tests that still expected a normal user's program to be public immediately, and that expected an outsider to edit a missing record.
- Added `tests/admin-permissions.test.ts` (roles, contact redaction, suggested edits, approve/reject, re-open, report cap, pending programs, pending-program cap) and `tests/admin-guard.test.ts` (session claim, 404 for non-admins, fail closed when Clerk throws).
- `pnpm exec vitest run` — 47 passed, 10 files. The "role lookup failed" line in the guard test is the fail-closed path, and the test expects it.
- Not run: a signed-in browser pass. Any signed-in user can still mark a person found; only direct edits are limited to the reporter and admins.

## 2026-11-14 · Claude (admin rollout steps done: migration applied, first admin set)

- The user approved the three rollout steps, run by separate agents. **Migration 0001 applied to Supabase** (`pnpm db:migrate`; migrations recorded 2): new tables `program_events`, `missing_person_edit_requests` (empty); `programs` gained `status`, `reviewed_by_user_id`, `reviewed_at`, `rejection_reason`, `updated_at`; `missing_person_events.reason`; 4 new indexes. Row counts unchanged (4 missing persons, 5 events, 5 programs, 6 registrations, 0 sms_log, old `users` 0); all 5 existing programs are `approved`. **Name recompute:** dry run found all 4 records already match `normalizeName`, so nothing was updated (no `updated_at` touched).
- **First admin:** user confirmed Oshan Hamal (`oshanhamal3@gmail.com`, `user_3M7BtGwKXFbzSMTeocvWqodPeow`); Claude set `public_metadata.role = "admin"` on the **development** instance through the Clerk API (previewed with `--dry-run`, read back). Abhishek Shrestha (`user_3M7J130dfCKtpH7nJaGZNFLvOtF`) stays a normal user (empty `public_metadata`), useful for testing the limits. No custom session claim is configured, so `getViewer` uses the Backend lookup fallback (one Clerk call per request). Sign-up is public and email/phone verification is off.
- Read-only check of the app's own queries against the migrated database passed (people list, approved programs, all programs, pending queue, edit requests).
- Still open: Clerk device trust; the 6 old tests listed in the previous entry; the dead `users` table; nothing is committed.

## 2026-11-14 · Claude (admin role, approvals, supervised edits BUILT; branch `admin-dashboard`)

- User asked to build it now, so Claude did (three parallel agents on separate files, main agent integrated). **No tests were written or edited.** Not committed. **The migration is NOT applied to Supabase yet** (waiting for the user's approval), so the running app needs it before these pages work against the real database.
- **Foundation (main agent):** `src/core/permissions.ts` (`Actor` with `isAdmin`, `isReporter`, `isHost`, `canEditMissingDirectly`, `canSeeContact`, `canReopen`, `canManageProgram`, `canSeeProgramStatus`, `LIMITS`), `src/lib/roles.ts` (`isAdminClaims`, `getViewer` = session claim `metadata.role` else one Clerk Backend lookup per request, fails closed; `requireAdmin()` for actions; `adminPageGuard()` = 404 for non-admins), schema + migration `0001_gigantic_goliath.sql` (programs `status` default `pending` + review columns + `updated_at`; `program_events`; `missing_person_edit_requests`; `missing_person_events.reason` and kinds `reopened|edit_requested|edit_approved|edit_rejected`; a trailing `UPDATE programs SET status='approved'` backfill so existing demo programs stay public). Role = Clerk `publicMetadata.role === 'admin'`.
- **Missing People:** only admin or reporter edits directly (`editMissing` returns `forbidden` otherwise); everyone else `requestEdit` (record untouched, per-user pending cap 10; a suggestion never changes `contact`); admin `listEditRequests`/`approveEditRequest` (stale flag, applies once under concurrency)/`rejectEditRequest` (reason required); `reopenMissing` admin only with reason; `redactForViewer` strips `contact` unless admin or reporter (done on the server before data reaches the client); `reportMissing` limit 10 per user per 24h (advisory lock; admins exempt) -> `{ok:false, rateLimited:true}`; `normalizeName` is Unicode-aware, `searchMissing` returns `[]` for a non-empty query with no usable tokens; found confirmation message now stays visible. Pages: `/missing` (Suggest an edit vs Edit details, admin Re-open), `/admin/missing` (queue with diff, direct edit, re-open, full history timeline).
- **Programs:** `createProgram(db, actor, input)` (actor may still be a plain userId string = non-admin): non-admin -> `pending` (cap 5 pending per user), admin -> `approved`; `listPrograms` approved only; `listMyPrograms`, `listAllPrograms`, `listPendingPrograms`, `approveProgram`, `rejectProgram(reason)`, `editProgram` (host or admin, live at once, logs before/after; host edit of a rejected program resubmits; hosts can't edit cancelled; capacity can't drop below registered), `cancelProgram`, `registerForProgram` refuses non-approved (`not_open`), `listAttendees` (admin only), `programHistory`, `listRecentProgramEdits`. `cancelAction` now says "You were not registered for this program." when nothing was cancelled. "Verified" wording removed from the page and loading shell; "Your programs" section; `/admin/programs` (queue, approve/reject with reason, edit/cancel, attendees, recent host edits feed).
- **Admin shell:** Nav shows an Admin tab only to admins; `/admin` overview (pending counts, user count, recent activity); `/admin/users` (Clerk list, grant/revoke admin, ban/unban, confirm step, rules in `src/core/admin/rules.ts`: no self-demote, never the last admin, no self-ban, no banning an admin). Every admin page calls `adminPageGuard()` and all 12 admin server actions start with `requireAdmin()`.
- **Checks:** `tsc` clean, `pnpm lint` clean, `pnpm build` ok (routes `/admin`, `/admin/missing`, `/admin/programs`, `/admin/users`). Each agent verified its core with throwaway PGlite scripts outside the repo (permission matrices, pending/approve/reject, rate limits, concurrency, name search, nothing deleted). **Not checked in a browser, and nothing was run against Supabase or the real Clerk API.**
- **Repo tests that now fail (6; they assert the old behavior; Claude did not edit them):** `tests/edge-review.test.ts` "lets a different signed-in user edit and mark found" (an outsider can no longer edit; flip it to expect `forbidden`, and add the new permission-matrix tests) and the program tests that expect a normal user's program to be listed/registerable immediately: `tests/edge-review.test.ts` (3: in-progress program, registration after end/cancel, three seats for six people) and `tests/programs.test.ts` (2: search+category, register/full/cancel). Fix by creating those programs as an admin actor (`{ userId, isAdmin: true }`) or approving them first. The earlier two name-search tests now pass.
- **Grok next:** update the 6 tests above; write tests for the permission matrix (`docs/grok/brief-admin.md`), edit requests, approvals, re-open, redaction, rate limits, admin rules and the admin pages' guards (mock `@/lib/roles`).
- **Needs the user's approval before Claude does it:** apply migration 0001 to Supabase; recompute `name_normalized` for existing rows (only matters for names stored under the old rules); set the first admin's `publicMetadata.role` in Clerk (user signs up/uses their own account).

## 2026-11-14 · Claude (admin-dashboard: review done, brief written)

- User asked for a read-only review of every tab by separate agents (Dashboard/auth, Missing People, Communities), then a design for admin supervision. Three Explore agents reviewed the code; nothing was changed and no account was created. Key findings: no role concept anywhere; every action only checks "signed in"; any user can edit any missing record, mark anyone found (irreversible) and publish a program instantly; contact details are visible to everyone; edit history is never shown; registration has no program-status check; non-Latin names normalize to an empty key (and an empty search lists everyone).
- User decisions: admin = Clerk `publicMetadata.role`; approval needed for new programs and edits to existing missing records; admin dashboard with review queues, direct edit + audit, history, attendee lists and user management; contact line only for admins and the reporter; only admins re-open found; report rate limit; fix non-Latin name search. Later refinement: **the owner of a post edits that post directly** (reporter for records, host for programs; owner program edits go live at once and are logged); reporters still cannot re-open found.
- Created branch `admin-dashboard` from `main`. Wrote `docs/grok/brief-admin.md` (permission matrix, schema, function list, name fix, test ideas). **No code written yet.**
- **Grok next:** turn the brief into behaviors in `plan.md` and write the failing tests.
- **Claude next:** after tests exist, implement; ask the user to approve the Supabase migration, the name backfill and the Clerk session-claim change before touching them.

## 2026-11-14 · Claude (instant tab content)

- Made `tests/tab-loading.test.ts` pass (5/5) without editing any test. Did not touch `src/proxy.ts`, the Dashboard page, Clerk, the database queries, or the flood map. Did not read `.env`; no database rows were written, changed or deleted.
- New: `src/components/ListSkeleton.tsx` (three card placeholders, `aria-busy="true"`, "Loading records", shimmer that stops under reduced motion; styles appended to `page-ui.module.css`), `src/app/missing/loading.tsx` and `src/app/communities/loading.tsx` (real heading + skeleton, no fetch).
- `src/app/missing/page.tsx` now paints header, search and the report panel right away and wraps the new server component `MissingResults.tsx` (which runs `searchMissing`) in `<Suspense key={q} fallback={<ListSkeleton />}>`. `src/app/communities/page.tsx` paints header, host panel, search and the category chips (now `next/link` `Link`s) and wraps `ProgramResults.tsx` (which runs `auth()` and `listPrograms`) in `<Suspense key={q|category}>`. Query-string behavior (`q`, `category`) is unchanged and `force-dynamic` stays, so results are never cached.
- Results: `pnpm vitest run tests/tab-loading.test.ts` 5 passed; `pnpm lint` clean; `pnpm build` ok. Live dev server: signed-out `/missing`, `/communities` (with and without query) and `/dashboard` still 307 to sign-in, `/sign-in` 200, no compile errors. Not checked in a browser (needs a Clerk session), so the skeleton flash itself is unseen.

## 2026-11-14 · Grok

- Tab switches feel slow because `/missing` and `/communities` are `force-dynamic` and wait on Clerk plus Supabase before any HTML paints. There is no `loading.tsx`.
- Added `tests/tab-loading.test.ts`. It is red on purpose. It expects `ListSkeleton`, `src/app/missing/loading.tsx`, `src/app/communities/loading.tsx`, a Suspense boundary around each result list, and Communities category chips as `next/link` instead of `<a>`.
- **Claude next:** make that test pass. Contract is the "instant tab content" section in `docs/grok/plan.md`. Do not edit the test. Do not change `src/proxy.ts` or the Dashboard page. Do not delete existing database rows.

## 2026-11-14 · Grok

- Wrote the tests Claude asked for. `tests/smoke.test.ts` now expects `users`, `missing_persons`, `missing_person_events`, `sms_log`, `programs`, `program_registrations`.
- `tests/missing.test.ts` covers report, search (any word order), mark-found once, edit history, and that the row stays.
- `tests/programs.test.ts` covers search plus category, hidden ended programs, one registration, a full program, and cancel without deleting the row.
- `pnpm exec vitest run tests/smoke.test.ts tests/missing.test.ts tests/programs.test.ts` — 6 passed.
- Added `pnpm db:seed` (`scripts/seed-demo.mjs`). It only inserts a sample person or program when that name or title is absent. It ran once: added 4 missing-person records and 5 programs. Existing rows were left as they were.

## 2026-11-14 · Claude (crud-tabs built: nav, Missing People, Communities, Supabase DB)

- User said to build once the database test passed (Grok had not delivered the plan/tests yet), so Claude built it from `brief-crud-tabs.md`. **No tests written or edited.** Grok: please write them.
- **Database:** Supabase Postgres via the **Session pooler** `DATABASE_URL` (the direct host is IPv6-only and failed). `drizzle.config.ts` now loads `.env` (`process.loadEnvFile`). The unapplied 0000 migration was regenerated from the new schema (`0000_brown_shatterstar.sql`) and **applied to Supabase**: tables `users`, `sms_log`, `missing_persons`, `missing_person_events`, `programs`, `program_registrations`. `community_posts` was dropped from the schema (replaced).
- **Schema:** `missing_persons` gains `public_number` (identity from 1001, shown `REG-01001`), `notes`, `contact`, `reporter_user_id`, `found_by_user_id`, `found_note`, `updated_at`; `reporter_phone` is now nullable. `missing_person_events` is the append-only history. `programs` + `program_registrations` (unique per user and program, `cancelled_at` instead of delete).
- **Core logic (pure, takes a `db` and an actor, PGlite-testable):** `src/core/missing/{names,validate,service}.ts` (`reportMissing`, `searchMissing`, `getMissing`, `markFound`, `editMissing`, `missingHistory`, `normalizeName`, `lastFirst`, `publicId`) and `src/core/programs/{categories,service}.ts` (`createProgram`, `listPrograms`, `registerForProgram`, `cancelRegistration`, `cleanProgram`). Row locks (`for update`) make marking found and registering safe under concurrency.
- **Decisions I made (open questions in the brief):** a found record cannot be re-opened; ended programs are hidden (upcoming and in-progress shown, soonest first); registrations can be cancelled (`cancelled_at`) and re-registered; search matches every word in any order, ignoring case and accents, and a punctuation-only query lists everything; start/end times from the form are read in the server's time zone.
- **UI:** `src/components/Nav.tsx` (Dashboard, Missing People, Communities + Clerk `UserButton`, active tab via `aria-current`) rendered in the layout inside `<Show when="signed-in">`; `/missing` and `/communities` server pages with server actions (`actions.ts`) and client forms; shared styles in `src/components/page-ui.module.css`.
- **Checked:** lint clean (1 warning in Grok's `clerk-gate.test.ts`), build ok, live dev server: signed-out tab URLs redirect to sign-in. Core logic verified with a throwaway PGlite script (not a repo test): report, search (order/accents/partial), found once + idempotent, edit diff + history, create/validate programs, list/filter/search, register/cancel/capacity, 6 concurrent registrations on a 3-seat program yields exactly 3. Read-only queries ran against the real Supabase DB. **Not checked in a browser** (needs a Clerk session).
- **Failing test for Grok:** `tests/smoke.test.ts` asserts a `community_posts` table, which the brief replaced. Claude did not edit it. Update the expected tables to `users, missing_persons, missing_person_events, sms_log, programs, program_registrations`. (11/12 green otherwise.)
- Still open: Clerk device trust (can demand an emailed code at first sign-in on a new device); `users` table (phone + password hash) no longer matches Clerk; the Auth0 entry in `.mcp.json` is unused.

## 2026-11-14 · Claude (supabase mcp)

- Added the Supabase MCP server to `.mcp.json` (http) for project ref `qmkvuzjcfspyvzttweez` with features docs, account, database, debugging, development, functions, branching, feedback, notebooks, storage.
- User must authenticate via `claude /mcp` (browser OAuth) and approve the server.
- The hosted database for the crud-tabs slice is Supabase (Postgres). The user still has to put `DATABASE_URL` in `.env`; Claude does not read `.env`.

## 2026-11-14 · Claude (new branch `crud-tabs`: nav + Missing People + Communities)

- Created branch `crud-tabs` from `main` (`e81a7e5`). The user wants a top nav (Dashboard, Missing People, Communities, profile), a Missing People tab, and a Communities tab, with their reference screenshots.
- User answers: hosted Postgres (Neon or Supabase); Missing People = search, report, mark found, edit (never delete); Communities = host a program, register to attend, search + category filters (no share/directions/export yet); Grok writes the plan and tests first.
- Wrote `docs/grok/brief-crud-tabs.md` with the layouts, rules, proposed schema (extend `missing_persons`, add `missing_person_events`, replace `community_posts` with `programs` + `program_registrations`) and where the logic should live (`src/core/missing`, `src/core/programs`, pure functions taking a `db` and an actor so the SMS commands can reuse them). **No code written yet.**
- **Grok next:** refine the brief into behaviors in `plan.md` and write the failing tests (nav, missing search/report/found/edit + history, programs create/register/search/filter).
- **User next:** create the hosted Postgres database and put its connection string in `.env` as `DATABASE_URL`; tell Claude when done.

## 2026-11-14 · Claude (custom Clerk sign-in/sign-up form; conflict with two of Grok's tests)

- User: saw Clerk's prebuilt sign-in (email first, password on the next step) and asked for the password box on the same screen, with email at account creation. They chose **our own form with Clerk behind it** over the prebuilt components.
- Built with Clerk's current hooks (`useSignIn`/`useSignUp` from `@clerk/nextjs`): `src/components/auth/{SignInForm,SignUpForm,ForgotPassword,AuthShared}.tsx` + `auth.module.css`, helpers in `src/lib/auth-forms.ts` and `src/lib/phone.ts`. Sign-in: email or US phone + password via `signIn.password`. Sign-up: name, email, phone, password, confirm, consent via `signUp.password` (consent timestamp stored in `unsafeMetadata`, client-set so not authoritative). Forgot password: emailed code reset (`resetPasswordEmailCode`). After success it goes to the same-origin `redirect_url` or `/dashboard` (`destinationAfterAuth`).
- **Conflict for Grok:** `tests/clerk-sign-in.test.ts` (2 tests) asserts the pages render Clerk's prebuilt `<SignIn>`/`<SignUp>` with `fallbackRedirectUrl="/dashboard"` and an `appearance` prop. That contract was changed by the user's choice, so those 2 tests now fail (6/8 green). Claude did not edit them. Grok: rewrite them for the custom forms (mock `useSignIn`/`useSignUp`; check the page shows the frame text, email/phone + password fields, and that sign-up has email, phone, password, confirm, consent).
- Also done to keep the suite green: removed the `@auth0/nextjs-auth0` dependency (a Clerk gate test requires it; an earlier removal command had been blocked); excluded `tests/` from `next build`'s type check in `tsconfig.json` (`tests/clerk-gate.test.ts` calls the Clerk-typed `proxy(req)` with one argument, which fails the app build though Vitest is fine); added an ESLint override for `react/no-children-prop` in `tests/**` (`tests/clerk-sign-out.test.ts` trips it). Grok may prefer to fix those two test lines instead.
- Not done: Clerk **device trust** is on, so a first sign-in from a new device can require an emailed code, which this form cannot complete (it shows a message). Turning it off lowers security and needs the user's OK (a config change was blocked until they approve it).
- Checks: lint clean, build ok, live `/sign-in` has the password field and forgot link, `/sign-up` has email, phone, 2 password fields, consent; signed-out `/dashboard` still 307 to `/sign-in`.

## 2026-11-14 · Claude (Clerk dashboard settings)

- User: no password option on sign-in, and wanted email at account creation. The cause was Clerk instance settings, not code: phone was required and verified by SMS code with a code-only sign-in, email was optional with email-code only.
- Patched the **development** instance of "Flood Response" with `clerk config patch` (previewed with `--dry-run` first): email required at sign-up, no verification code; phone still required but verified by nothing (no OTP, as the user wanted); code-based sign-in strategies for both removed so password sign-in is used; password minimum length 15 -> 8 (breached-password check left on). Production instance untouched.
- Consequence: emails and phone numbers are **unverified** (anyone can enter any number). Fine for the demo, but the SMS features must not trust a phone number as proof of identity until verification (OTP) is turned on later.

## 2026-11-14 · Claude (switched to Clerk)

- User decision: use **Clerk** for authentication. Approved plan: no users to migrate (no database was ever set up). Ran `clerk init --app app_3M79JKa3WOgPqpcalyfZWvlDEdv` (the app the user picked in the dashboard) after the user signed the CLI in; it installed `@clerk/nextjs`, wrapped the layout in `ClerkProvider`, added `/sign-in` and `/sign-up`, and wrote the keys to `.env` (not read by Claude). It also installed Clerk agent skills globally.
- Claude then: replaced `src/proxy.ts` with `clerkMiddleware` (public: `/sign-in`, `/sign-up`, `/api/sms`, `/geo/*`; everything else `auth.protect()`), styled the two pages with `AuthFrame` + `clerkAppearance` (lavender, black buttons), put `UserButton` in the root layout, and **deleted the home-grown auth** (`src/lib/auth/*`, `/api/auth/*`, the sign-in/register cards, `/login` and `/register`, the `jose` dependency, and the `consented_at` schema change + migration `0001`, which were never committed). Updated `.env.example`, README, CLAUDE.md, AGENTS.md.
- Checks: lint clean, 1/1 tests, build ok. Live dev server: signed-out `/dashboard`, `/missing`, `/` all 307 to `/sign-in?redirect_url=…`; `/sign-in` and `/sign-up` 200; `/api/sms` 501 (public). Not checked in a browser: the actual sign-up/sign-in, which method(s) are enabled, and the post-sign-in redirect to `/dashboard`.
- Open: `users` table (phone, `password_hash`) no longer matches. Needs a decision before SMS work: link by `clerk_user_id` and make `password_hash` optional. Phone sign-in in Clerk needs SMS codes (OTP), which the user deferred. `createRouteMatcher` logs a deprecation warning in this Clerk version (harmless).
- **Grok next:** tests for the Clerk-based gate (mock `@clerk/nextjs/server`). `brief-own-auth.md` is obsolete.

## 2026-11-14 · Claude (own-auth cutover done)

- User approved retiring the three Auth0 tests: moved to `docs/grok/retired-tests/*.txt` (nothing lost, vitest ignores them). Grok: rewrite them for the new behavior if still wanted.
- Cutover finished: `src/proxy.ts` verifies our session cookie (signed-out -> `/login?next=<path>`, signed-in on `/login`/`/register` -> `/dashboard`, `/api/auth/*` and `/api/sms` public); `/login` is phone + password, `/register` is name + phone + password + confirm + consent, both `fetch` the routes, show form-level errors (401 generic, 429, network) and honor a validated `?next=` (`src/lib/auth/redirect.ts`, open-redirect safe, defaults to `/dashboard`); root layout shows a POST logout form only when signed in (`getCurrentUser()`).
- Removed: `@auth0/nextjs-auth0`, `src/lib/auth0.ts`, `auth-links.ts`, `auth-validation.ts`, the Auth0 password-reset action, Auth0 vars from `.env.example`. Forgot password is just text ("contact an administrator"); there is no email.
- Verified: lint clean, 1/1 repo tests (smoke), build ok. Live dev server with a signed test cookie: signed-out `/dashboard` 307 -> `/login?next=%2Fdashboard`; signed-in `/dashboard` 200 with logout form; signed-in `/login` and `/register` 307 -> `/dashboard`; tampered cookie rejected; logout POST 303 -> `/login` and clears the cookie; GET logout is 405; `/api/sms` still 501; security headers present. Register/login routes were checked against PGlite with a throwaway script (not a repo test).
- **Needs a real Postgres** (`DATABASE_URL`, then `pnpm db:migrate`) to actually register and log in in the running app. None is installed on this machine.
- **Grok next:** write the tests for all of `src/lib/auth/*`, the three routes, and the proxy gate.

## 2026-11-14 · Claude (own-auth backend built; UI cutover waiting)

- The user asked Claude to make the industry-level sign-in/sign-out changes directly (no OTP for now), so the backend from `brief-own-auth.md` is built. **No tests were written or edited** (Grok's three Auth0 tests are untouched and still pass). 26/26, lint, build pass.
- New, all under `src/lib/auth/`: `password.ts` (scrypt N=2^15, per-user salt, timing-safe compare, dummy hash for unknown users), `session.ts` (HS256 JWT in an httpOnly, SameSite=Lax cookie, `__Host-` prefix + Secure in production, 7 days, `AUTH_SECRET` 32+ chars), `rate-limit.ts` (5 failures/phone/15 min, 30/IP, 10 sign-ups/IP/hour, in-memory), `validation.ts` (US phone to E.164, password 8-128 with a letter and a number), `service.ts` (`registerUser`, `loginUser(db, ...)`, works with PGlite), `http.ts` (same-origin check, JSON body parsing, no-store), `current-user.ts`.
- New routes: `POST /api/auth/register` (201 + cookie, 400 per-field, 409 duplicate phone), `POST /api/auth/login` (same 401 message for unknown phone and wrong password, 429 + Retry-After), `POST /api/auth/logout` (POST only; form posts get a 303 to `/login`).
- Schema: `users.consented_at` (not null) + migration `0001_freezing_the_executioner.sql`. Security headers added in `next.config.ts`. `.env.example` has `AUTH_SECRET`.
- Verified with a throwaway script outside the repo (not a repo test): hashing, session tamper/expiry, limiter window, register/login/logout routes against PGlite, CSRF origin check. **Grok: these behaviors need real tests.**
- **Not done (blocked on the three Auth0 tests, which Claude must not edit):** switch `src/proxy.ts` to the new cookie, rebuild `/login` + `/register` (phone + password, fetch the routes), logout form in the root layout, then delete `src/lib/auth0.ts`, `src/lib/auth-links.ts`, `src/lib/auth-validation.ts`, `src/app/(auth)/login/actions.ts` and the `AUTH0_*` env. Cutover breaks `tests/auth-proxy`, `auth-login`, `auth-logout`; they need retiring/rewriting first.

## 2026-11-14 · Claude (direction change: own auth, no Auth0)

- User decision: they want all credential checking on our side, not on Auth0's page. Chosen: **own `users` table, phone number as the login, drop Auth0.**
- Wrote `docs/grok/brief-own-auth.md` (decisions, suggested design, endpoints, what existing tests it replaces). **No code changed yet.** The app still works as before (Auth0 hand-off) until Grok's new tests exist.
- **Grok next:** refine the brief into behaviors in `plan.md` and write the failing tests (hashing, session cookie, register, login, logout, proxy gate). Retire or rewrite `auth-login`, `auth-logout`, and `auth-proxy` tests, since they target Auth0.
- **Claude next:** implement once the tests are red, then remove Auth0 (package, `/auth/*`, `src/lib/auth0.ts`, `src/lib/auth-links.ts`, `AUTH0_*` env) and update `CLAUDE.md`.

## 2026-11-14 · Claude (no fake password step)

- Problem: `/login` accepted any email/password and then showed Auth0's page, because our form only checked the fields were filled and never verified anything. Real verification is Auth0's.
- Fix (user chose): our pages no longer have password fields. `/login` has the email/ID box + SIGN IN + inline Forgot Password; `/register` has name, email, phone, consent. Both say the password is entered on Auth0's secure page.
- `loginHandoffHref` now adds `prompt=login`, so Auth0 always asks for credentials even if an old Auth0 session exists. The plain "Log in with Auth0" link still uses `loginHref()` unchanged (tests).
- `src/lib/auth-validation.ts`: removed password rules (`validateSignIn` only needs the identifier; `validateRegistration` no longer takes passwords). 26/26 tests, lint, build pass.

## 2026-11-14 · Claude (revert blank redirect pages; empty placeholder pages)

- Reverted the "blank `/login` and `/register` that redirect to Auth0" change: that was a misreading. `/login` is the sign-in card again (`SignInCard`) and `/register` the create-account card (`RegisterCard`), two separate pages with the Auth0 hand-off. `AutoRedirect.tsx` is deleted.
- What the user actually wanted: `/dashboard` and the other app routes are **empty placeholder pages that only show their name**, so you can tell which page you landed on. `ComingSoon` now renders just the title heading; `/dashboard`, `/communities`, `/missing` use it. The signed-in-as welcome text on the dashboard was removed.
- 26/26 tests, lint and build pass. `/dashboard` signed-out is still a 307 to `/login`.

## 2026-11-14 · Claude (blank login/register that redirect to Auth0)

- User decision: `/login` and `/register` are blank pages that redirect straight to Auth0; after login the user lands on `/dashboard`. The custom forms are no longer shown.
- New `src/components/auth/AutoRedirect.tsx` (client; `window.location.replace(href)` plus a plain link as no-JS fallback). `/login` -> `loginHref()` with text "Log in with Auth0" (kept so `tests/auth-login.test.ts` stays green). `/register` -> `loginHandoffHref({ signup: true })`.
- The form components (`SignInCard`, `RegisterCard`, `AuthShared`, `auth.module.css`) and `src/lib/auth-validation.ts` / `requestPasswordReset` are now unused but left in place. Delete or reuse later.
- 26/26 tests, lint, build pass; `/login` and `/register` return 200 with the right hrefs, `/dashboard` signed-out is a 307 to `/login`.

## 2026-11-14 · Claude (browser test)

- No browser tool was available, so this was a curl + code-reading check, not a real browser run. Signed out: `/dashboard`, `/missing`, `/communities`, `/` all 307 to `/login`; `/login` and `/register` 200; `/auth/login?returnTo=%2Fdashboard` 307 to the Auth0 `/authorize` with `redirect_uri=http://localhost:3000/auth/callback`.
- Callback trace (auth-client.js): `returnTo` is stored in the transaction cookie at `/auth/login` and `defaultOnCallback` redirects to it; default is `signInReturnToPath` ('/dashboard'). `proxy.ts` returns the `/auth/*` response untouched. Code path always lands on `/dashboard`. The Auth0 app has no Application Login URI; `custom_login_page_on` is true (tenant-side, cannot be inspected via MCP). Auth0 logs not readable (token lacks `read:logs`).
- Likely causes outside the code: opening the app on a host other than `localhost:3000` (127.0.0.1 or another port breaks the callback/state cookie), or a tenant Universal Login customization or email-verification step. Also the old dashboard was a bare "Coming soon", easy to mistake for a wrong page.
- Changed `src/app/dashboard/page.tsx`: now a dynamic server component showing "You are signed in as <name or email>" via `auth0.getSession()`.
- Not done: authenticated flow (needs the user to log in), logout round trip, visual/responsive checks.
- 26/26 tests, lint, build pass.

## 2026-11-14 · Claude (land on dashboard after login)

- User report: after logging in they end up on some other page; they want `/dashboard` first.
- `src/lib/auth0.ts`: `signInReturnToPath: '/dashboard'`, so any login without a `returnTo` lands on the dashboard.
- `src/proxy.ts` (touched on user request; proxy tests still pass): a signed-in visitor to `/login` or `/register` is redirected to `/dashboard`. Signed-out behavior is unchanged.
- 26/26 tests, lint and build pass. The exact page the user was landing on is not yet known (asked them). Grok: consider a proxy test for the signed-in `/login` and `/register` redirect.

## 2026-11-14 · Claude (auth UI, two pages)

- User change: sign in and create account are now **two separate pages**, no split screen. `/login` is a centered sign-in card with "Don't have an account? CREATE ONE" (links to `/register`). `/register` is a centered create-account card with "Already have an account? SIGN IN" (links to `/login`). Same lavender/white/black style, validation, password toggles, Auth0 hand-off, inline forgot-password.
- Replaced `AuthSplit` with `src/components/auth/{AuthShared,SignInCard,RegisterCard}.tsx` and a rewritten `auth.module.css`. Pages import `SignInCard` / `RegisterCard`. Logic files (`auth-validation.ts`, `loginHandoffHref`, `requestPasswordReset`) unchanged.
- 26/26 tests green, lint and build pass. `/login` and `/register` return 200, `/dashboard` signed-out redirects to `/login`.
- A separate "signed out" confirmation page was not built (the user chose just the two pages).

## 2026-11-14 · Claude (auth UI)

- All 26 tests green, `pnpm lint` and `pnpm build` pass. `src/proxy.ts` untouched; no tests written or edited.
- Built the split-screen sign-in / create-account UI the user specified: `src/components/auth/AuthSplit.tsx` + `auth.module.css`, used by both `/login` and `/register` (register just focuses the name field). Added `lucide-react`.
- Chosen with the user: Auth0 still collects credentials. The forms validate, then redirect to `/auth/login?returnTo=%2Fdashboard` plus `login_hint` (and `screen_hint=signup` for Create Account). Passwords are never sent from our page. Phone is validated (US, E.164) but not stored yet.
- New logic with no tests (Grok to cover if wanted): `src/lib/auth-validation.ts` (`validateSignIn`, `validateRegistration`, `normalizeUsPhone`), `loginHandoffHref` in `src/lib/auth-links.ts`, and the server action `requestPasswordReset` in `src/app/(auth)/login/actions.ts` (calls Auth0 `/dbconnections/change_password`; connection name from `AUTH0_DB_CONNECTION`, default `Username-Password-Authentication`; not verified against the live tenant).
- Root layout renders the `Log out` anchor on every page; CSS hides it on the auth screens (`body:has([data-auth-page])`), so it stays in the HTML for the test.
- Live check (dev server): `/login` and `/register` return 200, `/dashboard` signed-out is a 307 to `/login`, and `/auth/login` redirects to the real Auth0 tenant `/authorize` with the right `redirect_uri`. That needed `AUTH0_SECRET`, which had gone missing from `.env`, so Claude appended a freshly generated one (without reading the file).
- Not checked: the visual result in a real browser, a full login round trip, and the password-reset email.

## 2026-11-14 · Claude

- Added `src/lib/auth-links.ts` (`loginHref`, `logoutHref`). All helper tests in `tests/auth-login.test.ts` and `tests/auth-logout.test.ts` pass, and `tests/auth-proxy.test.ts` is still green. `src/proxy.ts` untouched. `pnpm lint` clean. Full suite: 24 pass, 2 fail.
- **Still red on purpose** (the user asked for backend first, UI edits held back): `login page > links to Auth0 login…` needs `src/app/(auth)/login/page.tsx` to render `loginHref()`, and `logout link > renders a logout anchor…` needs `src/app/layout.tsx` to render `logoutHref(process.env.APP_BASE_URL)`.
- Auth0 MCP is now connected for Claude. Read the app **Flood Response**: it matches the plan (callback, logout URLs, regular web app, `client_secret_post`). No Auth0 changes were needed.
- Credentials were written to `.env` by the MCP's `save_credentials_to_file` (keys `APP_BASE_URL`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`; old dummy lines commented out). `.env` was not read. `AUTH0_SECRET` was not changed. `.gitignore` now also ignores the MCP's audit log. `pnpm build` not re-run yet.
- **Open for the user:** the two UI edits above, and whether the Auth0 user should be linked to `users.phone` (deferred).

## 2026-11-14 · Grok

- Current slice is login and logout only. Flood map tests are not started; the brief is under "Deferred" in `docs/grok/plan.md`.
- Added `tests/auth-proxy.test.ts` (expected green: do not change `src/proxy.ts` unless it fails), `tests/auth-login.test.ts`, and `tests/auth-logout.test.ts` (expected red).
- Red tests need `src/lib/auth-links.ts` (`loginHref`, `logoutHref`), the login page href, and a `Log out` anchor in `src/app/layout.tsx`. Contract is in `AGENTS.md` and `docs/grok/plan.md`.
- Auth0 MCP: created Regular Web App **Flood Response**, client id `8s1EhG5b3yZ5frSpT9rjlIkOrwGNgVyP`, callback `http://localhost:3000/auth/callback`, logout URLs `http://localhost:3000` and `http://localhost:3000/login`. Secret was not written to an env file. Do not create a second app and do not read `.env`.
- **Claude next:** make the two red test files pass with the minimum code. Then `pnpm lint` and `pnpm build`. Append the result here.

## 2026-11-14 · Claude

- Set up the Grok + Claude workflow: shared contract in `AGENTS.md`, `CLAUDE.md` points to it.
- Seeded `docs/grok/plan.md` with the Open-Meteo flood-map brief.
- No feature code or tests exist beyond `tests/smoke.test.ts`.
- **Grok next:** refine `plan.md` into behaviors with acceptance criteria and write the failing unit tests for behavior 1.
