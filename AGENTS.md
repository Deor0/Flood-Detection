<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Collaboration workflow (Grok + Claude)

Two agents work in this repo. Everything below the Next.js block is the shared contract.

**Roles**

- **Grok:** plans and writes unit tests first (TDD). Does not write implementation code.
- **Claude:** writes the minimum implementation to make Grok's tests pass. Does not write or edit tests. If a test looks wrong or contradictory, Claude records it in `docs/grok/status.md` instead of changing it.

**Handoff files (`docs/grok/`)**

- `plan.md`: Grok's current plan, one behavior per section, each with acceptance criteria.
- `status.md`: append-only log, newest entry first. Both agents write here: what was done, what is blocked, questions for the other agent.
- Tests live in `tests/` or next to the code as `src/**/*.test.ts`.

**Loop:** Grok adds failing tests for one behavior and updates `plan.md` → Claude makes them pass and logs it in `status.md` → Grok reviews and writes tests for the next behavior. Do one behavior at a time.

### Guide for writing tests (Grok)

**Run:** `pnpm test` (single run), `pnpm test:watch`, one file with `pnpm vitest run tests/<file>.test.ts`, one test with `-t "name"`. Vitest 5, Node environment, no Docker. `@/` maps to `src/`.

**Database tests:** use `createTestDb()` from `tests/db.ts`. It returns `{ db, client, close }`: a fresh in-memory PGlite Postgres with all Drizzle migrations applied. Call it once per test file in `beforeAll` and `close()` in `afterAll`. See `tests/smoke.test.ts` for the pattern. Schema is in `src/db/schema.ts` (`users`, `missingPersons`, `smsLog`, `communityPosts`). If a test needs a schema change, say so in `status.md`; Claude regenerates the migration with `pnpm db:generate`.

**Test pure logic first.** Prefer pure functions that take a `db` or plain inputs and return plain data. Mock `fetch` for external APIs (Open-Meteo, Twilio, Textbelt) with recorded fixtures; tests must never hit the network.

**Rules the tests must encode**

- Records are never deleted. No delete operations exist. `sms_log` is append-only. A missing person moves `missing → found`, it is never removed.
- Phone numbers are stored in E.164 and normalized with libphonenumber-js. Only +1 (US) is accepted for now, but nothing in the schema is US-specific.
- Core SMS entry point (planned, lives in `src/core`): `handleInboundSms({ from, body, receivedAt }) → { reply: string, notifications: { to: string, body: string }[] }`. Commands: `MISSING <name>, <location?>, <age?>`, `FOUND <name>`, `SEARCH <name>`, `STATUS <place>`, `HELP`. Twilio/Textbelt are thin adapters behind the `SmsProvider` interface in `src/sms/types.ts`, so test the core without any provider.
- Every page requires login except `/login` and `/register`; `/api/sms` is called by the SMS provider and is not behind login. `POST /api/sms` currently returns 501.

**Current state:** authentication is **Clerk** (not Auth0, not the home-grown password session). Sign-in is a custom form on `/sign-in` using `useSignIn`. Sign-up is `/sign-up` using `useSignUp`. Sign-out is Clerk's `UserButton` in the root layout. `src/proxy.ts` calls `auth.protect()` except `/sign-in`, `/sign-up`, `/api/sms`, and `/geo`. Tests: `tests/clerk-gate.test.ts`, `tests/clerk-sign-in.test.ts`, `tests/clerk-sign-out.test.ts`. One gate test is red until `@auth0/nextjs-auth0` is removed from `package.json`. Do not bring Auth0 or `POST /api/auth/*` back. `src/core`, `src/model` and the SMS adapters are still empty. `POST /api/sms` returns 501 and is public.

**Note for test authors:** Clerk needs a real instance, so mock `@clerk/nextjs/server` (`auth`, `clerkMiddleware`, `createRouteMatcher`) in unit tests. `docs/grok/brief-own-auth.md` is obsolete.

**New slice (branch `crud-tabs`, 2026-11-14): top nav + Missing People + Communities.** Brief: `docs/grok/brief-crud-tabs.md`. Grok writes the plan and tests first; Claude implements after they are red. Database is hosted Postgres (`DATABASE_URL`); tests stay on PGlite.

### Guide for implementing (Claude)

Read `docs/grok/plan.md` and `docs/grok/status.md` first, run `pnpm test` to see what is red, write code until green, then run `pnpm lint` and `pnpm build`, and append to `status.md`.
