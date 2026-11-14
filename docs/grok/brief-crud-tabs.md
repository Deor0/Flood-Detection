# Brief for Grok: nav bar, Missing People tab, Communities tab (branch `crud-tabs`)

Written by Claude on the user's answers (2026-11-14). **Grok: turn this into behaviors with acceptance criteria in `plan.md`, then write the failing tests. Claude implements after the tests exist.** Auth is Clerk (see `CLAUDE.md`). The three tabs are Dashboard, Missing People, Communities, plus a profile menu.

## User decisions

- **Database:** hosted Postgres (Neon or Supabase). The user creates it and puts the connection string in `.env` as `DATABASE_URL`. Tests keep using PGlite via `createTestDb()` (no network).
- **Missing People:** search by name, report a missing person, mark as found, edit details. **Records are never deleted.**
- **Communities:** host/register a program (create), register to attend, search + category filters. Not now: Share Details, Get Directions, Export Schedule.
- Every page requires sign-in (already enforced by `src/proxy.ts`). Any signed-in user may do all of the above for now.

## 1. Top navigation bar

Reference: a top bar with tab links, the active tab in a light gray pill, and a profile icon on the right.

- Tabs in order: **Dashboard** (`/dashboard`), **Missing People** (`/missing`), **Communities** (`/communities`). Profile menu on the right is Clerk's `<UserButton />`, which includes sign out.
- Shown only on signed-in app pages (not on `/sign-in` and `/sign-up`). The active tab follows the current path (`aria-current="page"`).
- It replaces the fixed top-right `UserButton` in `src/app/layout.tsx`. `tests/clerk-sign-out.test.ts` must stay valid (provider, `data-show="signed-in"`, user button, no `/auth/logout` or `/api/auth/logout`).
- Nav links must be keyboard reachable and collapse sensibly at phone width.

## 2. Missing People (`/missing`)

Reference layout: a search box, then result cards. Each record shows a status icon, **"Last, First"** name, `Age: 42 • ID: #REG-88219`, a status badge (`FOUND` or `UNACCOUNTED / MISSING`), one line of details (where, notes, "Verified 20m ago"), and a contact/case line.

- **Search:** case-insensitive, accent-insensitive, partial match on name; matches `Miller`, `miller david`, and `David Miller`. Header shows "Showing N matches for “Miller”". Empty query lists recent records.
- **Report:** form with full name (required), age (0-120, optional), last seen location (optional), notes (optional), contact (optional). Creates a record with status `missing` and a human-readable id `REG-` + number, unique and increasing.
- **Mark as found:** changes `missing` -> `found`, records who and when, optionally a note ("Sheltered at Central Community Post"). Idempotent: marking an already-found record is a no-op that reports it was already found. A found record can be re-opened as missing only if you decide so; say so in `plan.md`.
- **Edit:** change name, age, location, notes on an existing record. Every edit is kept in an **append-only history** (who, when, what changed). No delete anywhere, no API for it.
- Verified/"Xm ago" display: relative time from `updatedAt` (or found time).
- Proposed schema (Grok may adjust; Claude generates the migration): extend `missing_persons` with `public_id` (sequence, shown as `REG-nnnnn`), `notes`, `contact`, `reporter_user_id` (Clerk user id, nullable), `found_by_user_id`, `updated_at`; keep `reporter_phone`/`found_by_phone` **nullable** because the SMS commands (`MISSING`, `FOUND`, `SEARCH`) will reuse the same core functions and identify people by phone. New append-only `missing_person_events` (`id, missing_person_id, actor_user_id/actor_phone, kind: reported|edited|found, changes jsonb, created_at`).
- Put the logic in pure functions taking a `db` and an `actor` (`{ userId?: string; phone?: string }`) under `src/core/missing/`, testable with PGlite and reusable by `handleInboundSms` later. Web actions/route handlers stay thin.

## 3. Communities (`/communities`)

Reference layout: title "Community Awareness Programs", search box, category filter buttons (All Programs, First Aid & CPR, Flood & Landslide Safety, Volunteer Briefings, Evacuation Drills, Water Sanitation), then a card per program: type badge, "Organized by …", title, place, date/time, "184 registered • 250 capacity", "5 spots left" when few remain, "Open Access" for walk-ins, key topics, and **Register to Attend**.

- **Host a program:** form with title (required), category (one of the filters above), organizer, location, start and end time (end after start), key topics, capacity (optional = open access). Creator is recorded.
- **Register to attend:** a signed-in user registers once per program (unique per user and program); count and spots-left update; registering when full is refused with a clear message; open-access programs show "Open Access" and no capacity limit.
- **Search + filter:** text matches title, organizer, location and topics, case-insensitive; the category filter combines with the text search (AND). Programs listed by start time, upcoming first; past programs hidden or marked (Grok decides, write it down).
- Proposed schema: replace the unused `community_posts` with `programs` (`id, title, category, organizer, location, topics, starts_at, ends_at, capacity null, created_by_user_id, created_at`) and `program_registrations` (`id, program_id, user_id, created_at, cancelled_at null`, unique `(program_id, user_id)`). Because nothing is deleted, cancelling a registration (if wanted) sets `cancelled_at`. Logic under `src/core/programs/`, same pure-function style.

## Rules both tabs must respect

- No deletes anywhere. Phones in E.164 where stored (libphonenumber-js, US only for now).
- Inputs validated server-side (lengths, ranges, required fields) with per-field error messages the forms can show; never trust the browser.
- Clerk user id comes from `auth()` (`@clerk/nextjs/server`); mock it in tests.

## Open for the user (Claude will confirm during the build)

- Whether a found record may be re-opened as missing; whether past programs are hidden; whether registrations can be cancelled.
- Neon/Supabase setup: after the user pastes `DATABASE_URL`, Claude wires `drizzle-kit` to read `.env` and runs `pnpm db:migrate`.
