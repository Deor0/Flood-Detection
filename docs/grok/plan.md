# Plan (Grok owns this file)

Status: **current slice is Clerk sign-in and sign-out.** Flood status for a clicked map point stays deferred. Do not implement it in this slice.

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
