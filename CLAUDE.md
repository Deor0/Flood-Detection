# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Workflow

Grok plans and writes the unit tests (test-first); Claude only writes implementation. The shared rules are in `AGENTS.md` (imported above). At session start read `docs/grok/plan.md` and `docs/grok/status.md`, run `pnpm test` to see what is red, and append to `status.md` when a piece is done. Don't write or edit tests; flag bad ones in `status.md`.

## Status

Only the scaffolding layer exists. Features are built test-first (TDD), one behavior at a time. Most `src/core`, `src/model`, `src/sms/{twilio,textbelt}.ts` files are empty stubs, and `POST /api/sms` returns 501. Auth is Clerk; `/dashboard`, `/communities`, `/missing` are empty placeholder pages showing only their name. Don't assume business logic is present.

## Commands

Requires Node >= 20 (default shell Node may be older; use `fnm`/`nvm` to select one) and pnpm.

- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm format`
- `pnpm test` (Vitest, single run) · `pnpm test:watch`
- Single test: `pnpm vitest run tests/smoke.test.ts` or `pnpm vitest run -t "name pattern"`
- `pnpm db:generate` (after editing `src/db/schema.ts`) · `pnpm db:migrate` (needs `DATABASE_URL`) · `pnpm db:studio`

## Architecture

- **Next.js 16 App Router, no separate backend.** Pages and API are route handlers in `src/app`. Next 16 differs from older versions: route protection lives in `src/proxy.ts` (formerly `middleware.ts`). Check `node_modules/next/dist/docs/` before using Next APIs.
- **Clerk (`@clerk/nextjs`) handles auth; our own auth and Auth0 are gone.** `src/proxy.ts` is `clerkMiddleware`: every route calls `auth.protect()` except `/sign-in(.*)`, `/sign-up(.*)`, `/api/sms(.*)` and `/geo/*`. Signed-out visitors go to `/sign-in?redirect_url=…` and return after sign-in (fallback `/dashboard`). Pages `src/app/sign-in/[[...sign-in]]` and `sign-up/[[...sign-up]]` render our own forms (`src/components/auth/SignInForm.tsx`, `SignUpForm.tsx`, `ForgotPassword.tsx`) built on Clerk's `useSignIn`/`useSignUp` hooks, inside `AuthFrame`. The root layout shows Clerk's `<UserButton/>` (profile + sign out) when signed in. Server code gets the user with `await auth()` from `@clerk/nextjs/server`. Clerk's keys live in `.env`. Credentials are stored by Clerk, so `users.phone`/`password_hash` no longer drive login; linking a Clerk user id to our `users` table and to phone numbers for SMS is not done yet.
- **SMS core is provider-agnostic.** Planned: one function `handleInboundSms({ from, body, receivedAt }) → { reply, notifications: { to, body }[] }` in `src/core`, with Twilio (inbound webhook) and Textbelt (outbound fallback) as thin adapters in `src/sms` implementing `SmsProvider` (`src/sms/types.ts`). Provider chosen via `SMS_PROVIDER`. Commands: `MISSING <name>, <location?>, <age?>`, `FOUND <name>`, `SEARCH <name>`, `STATUS <place>`, `HELP`.
- **Data rules:** records are never deleted. `sms_log` is append-only; missing persons move `missing → found` rather than being removed. Phones are stored E.164 (normalize with libphonenumber-js; only +1 accepted for now but keep schema country-agnostic).
- **DB:** Drizzle + Postgres (`postgres-js`). `getDb()` in `src/db/index.ts` is lazy so builds work without `DATABASE_URL`. Migrations are generated into `src/db/migrations` (ESLint/Prettier ignore it; don't hand-edit).
- **Flood model:** precomputed per-region GeoJSON in `public/geo/`, read by `src/model`. No live Python.
- **Tests:** `tests/db.ts` `createTestDb()` returns a fresh in-memory PGlite DB with all migrations applied; call it once per test file (`beforeAll`). No Docker. `@/` aliases `src/` in both TS and Vitest.

## Environment

`.env` (gitignored); see `.env.example`. Needs Clerk's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (written by `clerk init`; never read or print them). A real Postgres `DATABASE_URL` is only needed for features that use the database (tests use PGlite). TypeScript is pinned to 6.x because typescript-eslint doesn't support 7 yet.
