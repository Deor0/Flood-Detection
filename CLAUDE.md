# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Status

Only the scaffolding layer exists. Features are built test-first (TDD), one behavior at a time. Most `src/core`, `src/model`, `src/sms/{twilio,textbelt}.ts` files are empty stubs, `authorize`-style logic doesn't exist yet, and `POST /api/sms` returns 501. Don't assume business logic is present.

## Commands

Requires Node >= 20 (default shell Node may be older; use `fnm`/`nvm` to select one) and pnpm.

- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm format`
- `pnpm test` (Vitest, single run) · `pnpm test:watch`
- Single test: `pnpm vitest run tests/smoke.test.ts` or `pnpm vitest run -t "name pattern"`
- `pnpm db:generate` (after editing `src/db/schema.ts`) · `pnpm db:migrate` (needs `DATABASE_URL`) · `pnpm db:studio`

## Architecture

- **Next.js 16 App Router, no separate backend.** Pages and API are route handlers in `src/app`. Next 16 differs from older versions: route protection lives in `src/proxy.ts` (formerly `middleware.ts`). Check `node_modules/next/dist/docs/` before using Next APIs.
- **Auth0 (`@auth0/nextjs-auth0` v4), not Auth.js.** `src/lib/auth0.ts` builds the client from `AUTH0_*` env vars. `src/proxy.ts` runs `auth0.middleware` (which mounts `/auth/login|logout|callback`) and redirects session-less requests to `/login`. Public: `/login`, `/register`, `/auth/*`; `/api/sms` is excluded from the proxy matcher because the SMS provider calls it. Auth0 identifies by email by default while `users.phone` is the app identity, so phone-based login is an unresolved design decision.
- **SMS core is provider-agnostic.** Planned: one function `handleInboundSms({ from, body, receivedAt }) → { reply, notifications: { to, body }[] }` in `src/core`, with Twilio (inbound webhook) and Textbelt (outbound fallback) as thin adapters in `src/sms` implementing `SmsProvider` (`src/sms/types.ts`). Provider chosen via `SMS_PROVIDER`. Commands: `MISSING <name>, <location?>, <age?>`, `FOUND <name>`, `SEARCH <name>`, `STATUS <place>`, `HELP`.
- **Data rules:** records are never deleted. `sms_log` is append-only; missing persons move `missing → found` rather than being removed. Phones are stored E.164 (normalize with libphonenumber-js; only +1 accepted for now but keep schema country-agnostic).
- **DB:** Drizzle + Postgres (`postgres-js`). `getDb()` in `src/db/index.ts` is lazy so builds work without `DATABASE_URL`. Migrations are generated into `src/db/migrations` (ESLint/Prettier ignore it; don't hand-edit).
- **Flood model:** precomputed per-region GeoJSON in `public/geo/`, read by `src/model`. No live Python.
- **Tests:** `tests/db.ts` `createTestDb()` returns a fresh in-memory PGlite DB with all migrations applied; call it once per test file (`beforeAll`). No Docker. `@/` aliases `src/` in both TS and Vitest.

## Environment

`.env` (gitignored) holds dummy values; see `.env.example` for the variable list. TypeScript is pinned to 6.x because typescript-eslint doesn't support 7 yet.
