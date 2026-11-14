# Flood Response

Next.js (App Router) + TypeScript, Postgres + Drizzle, own phone + password auth, Twilio/Textbelt SMS, Leaflet map.

## Setup

Requires Node >= 20 and pnpm.

```bash
pnpm install
cp .env.example .env   # then fill in values
```

`DATABASE_URL` points at a Postgres instance.

### Auth

Clerk. Create or pick a Clerk application and run `npx -y clerk@latest init --app <application_id>`
(or `clerk env pull`) to write `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env`.
Sign-in is `/sign-in`, sign-up is `/sign-up`. Sign-in methods (email, phone, ...) are configured in the
Clerk dashboard.

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
