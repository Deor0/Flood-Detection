# Flood Response

Next.js (App Router) + TypeScript, Postgres + Drizzle, Auth0, Twilio/Textbelt SMS, Leaflet map.

## Setup

Requires Node >= 20 and pnpm.

```bash
pnpm install
cp .env.example .env   # then fill in values (a dummy .env is already included)
```

`DATABASE_URL` points at a Postgres instance.

### Auth0

Create a _Regular Web Application_ in Auth0, then set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`
and `AUTH0_SECRET` (`openssl rand -hex 32`). In the Auth0 app settings add
`http://localhost:3000/auth/callback` to Allowed Callback URLs and `http://localhost:3000` to Allowed Logout URLs.
Login lives at `/auth/login`, logout at `/auth/logout`.

## Database

```bash
pnpm db:generate   # create a migration after editing src/db/schema.ts
pnpm db:migrate    # apply migrations to DATABASE_URL
pnpm db:studio
```

## Run / test

```bash
pnpm dev
pnpm test          # Vitest + in-memory PGlite (no Docker); applies migrations per test file
pnpm test:watch
pnpm lint && pnpm build
```

## Receiving SMS (Twilio webhook)

```bash
ngrok http 3000
```

In the Twilio console, set the number's "A message comes in" webhook to
`https://<ngrok-id>.ngrok-free.app/api/sms` (HTTP POST). `/api/sms` is excluded from auth.

## Layout

- `src/app` routes · `src/core` domain logic · `src/sms` provider interface + adapters
- `src/db` schema/migrations · `src/model` flood model access · `public/geo` per-region GeoJSON
- `tests` Vitest setup. Records are never deleted (missing persons, SMS log are append-only).
