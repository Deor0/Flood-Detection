# Brief for Grok: replace Auth0 with our own phone + password auth

Written by Claude on the user's decision (2026-11-14). **Grok: turn this into behaviors with acceptance criteria in `plan.md`, then write the failing tests. Claude implements after the tests exist.** Claude has not changed any code for this yet.

## Why

The user wants everything on their side: credentials are checked by our backend, no redirect to Auth0's hosted page, nothing a user types is verified anywhere else. Chosen: **our own `users` table, drop Auth0, login identifier is the phone number.** (This is also the original design: phone + password, E.164, `+1` only for now.)

## Decisions already made

- Identifier: **phone number**, normalized to E.164 with libphonenumber-js, US (+1) only. `users.phone` is unique. No email column.
- Passwords are verified by our backend against `users.password_hash`. Never log or return a password or hash.
- No Auth0: remove `@auth0/nextjs-auth0`, the `/auth/*` routes, `src/lib/auth0.ts`, and `AUTH0_*` env vars once the new tests are green. The Auth0 app "Flood Response" can stay unused.
- Pages stay two separate pages: `/login` (sign in, link to create account) and `/register` (create account, link back). The cards in `src/components/auth/` are the UI to reuse; they must change: the identifier is a phone number, and both forms now really submit to our backend (password and confirm-password fields come back on `/register`; password field comes back on `/login`).
- Everything else stays: all pages need login except `/login`, `/register`, `/api/auth/*`, and `/api/sms`. After a successful login or registration the user lands on `/dashboard`. Records are never deleted.

## Suggested design (Grok may refine; flag disagreements in `status.md`)

- **Hashing:** Node's built-in `crypto.scrypt` with a random per-user salt and `timingSafeEqual` (no native dependency). Store as one string, e.g. `scrypt$N$r$p$salt$hash`.
- **Session:** stateless signed cookie. JWT (HS256) via `jose` (already installed transitively; add it as a direct dependency), signed with `AUTH_SECRET`, payload `{ sub: userId, phone }`, 7-day expiry. Cookie is `httpOnly`, `sameSite=lax`, `path=/`, `secure` in production. Logout clears it.
- **Endpoints** (route handlers, JSON in and out):
  - `POST /api/auth/register` body `{ name, phone, password, consent }` -> creates the user, sets the session cookie, returns `{ ok: true }` (201). Errors: 400 invalid input with per-field messages, 409 phone already registered.
  - `POST /api/auth/login` body `{ phone, password }` -> 200 and cookie, or 401 with the **same** generic message for unknown phone and wrong password. Do the hash work even when the user does not exist, so timing does not reveal which phones are registered.
  - `POST /api/auth/logout` -> clears the cookie, 200.
- **Rules:** password at least 8 characters; name at least 2; consent must be true to register. Phone is normalized before lookup and before insert (`(555) 555-0100` and `+15555550100` are the same user).
- **Brute force:** a simple in-memory limiter, e.g. 5 failed logins per phone per 15 minutes returns 429. Keep it behind a small interface so it can be swapped later.
- **Proxy (`src/proxy.ts`):** verify the cookie with `jose` (works in the proxy runtime) instead of `auth0.getSession`. Signed-out requests to protected pages redirect (307) to `/login`; a signed-in visitor on `/login` or `/register` goes to `/dashboard`.
- **Pure logic first:** hashing, session sign/verify, phone normalization, validation, and the login/register functions (taking a `db`) should be plain functions testable with `createTestDb()` (PGlite) and no HTTP.
- **Schema:** `users` already has `id, phone (unique), name, password_hash, created_at`. If consent should be stored (recommended: `consented_at timestamptz not null`), say so in `status.md` and Claude will regenerate the migration with `pnpm db:generate`.

## Existing Auth0 tests that this replaces (Grok to retire or rewrite)

- `tests/auth-proxy.test.ts` mocks `@/lib/auth0` and `auth0.middleware`. The session gate behavior stays the same, but the mock target changes.
- `tests/auth-login.test.ts` (`loginHref`, "Log in with Auth0" link) and `tests/auth-logout.test.ts` (`logoutHref`, `/auth/logout?returnTo=` and the layout anchor) are Auth0-specific. Logout becomes a `POST /api/auth/logout` control (a form button) in the root layout that is hidden on the auth pages.
- `src/lib/auth-links.ts`, `src/lib/auth0.ts`, and the unused Auth0 password-reset action in `src/app/(auth)/login/actions.ts` go away with them.

## Open questions for the user (Claude will ask them)

- **Forgot password:** there is no email. SMS reset via our provider is possible later; for now the link is removed or shows "contact an administrator". Decide.
- **Postgres:** the running app needs `DATABASE_URL` pointing at a real Postgres. Tests do not (PGlite).
