# Flood Response

A flood desk for anywhere in the world, plus the tools a community needs after a flood: a registry of missing people and a list of community programs. Built for a 24-hour hackathon.

**Problem.** Flood warnings are hard to read and hard to act on. Raw river data does not say "is this normal or dangerous?", and after a disaster, families searching for each other have no single place to look.

## What exists today

- **Flood desk (`/dashboard`).** Click anywhere on a world map and the server fetches real river discharge for that point. Severity (`normal`, `watch`, `warning`, `severe`) compares the current GloFAS discharge with that river cell's own 1984-to-present history (Gumbel fit; boundaries at 2, 5 and 20 years; display capped at 40 years). Fewer than 10 yearly maxima gives `unknown`, never a made-up number.
- **Water-fill simulation.** The rise above bankfull is applied to real terrain with a HAND model (height above nearest drainage), so hollows behind ridges stay dry. Bankfull depth is an adjustable assumption.
- **Nepal replay.** A documented timeline, sources and impact figures for the 26 Aug 2026 Rasuwa event (Bhote Koshi / Trishuli), including the Copernicus EMS EMSR927 figures. It is **not** an animated river rise: that event was a slope and ice failure that river and rain data do not show, and the screen says so.
- **Simulated alert pipeline.** The exact SMS and voice script appear in an on-screen phone preview, labelled `SIMULATION ONLY`. Admins move an alert through `detected → verified → notified → acknowledged`; steps are logged in an append-only table.
- **Missing People (`/missing`).** Report, search (any word order, accent-insensitive), mark found, suggest edits. Contact details are visible only to admins and the reporter.
- **Community programs (`/communities`).** Search by category, host programs, register and cancel.
- **Admin (`/admin`).** Approval queues for programs and edit suggestions, direct edits with history, re-open found records, attendee lists, user management. Role is Clerk `publicMetadata.role === 'admin'`, checked on the server for every page and action.
- **Auth.** Clerk, with our own sign-in and sign-up forms. Every page requires login except `/sign-in`, `/sign-up`, `/api/sms` and `/geo/*`.

## What is simulated or not built

- **No real alert, SMS or call is ever sent.** Alerts are on-screen only, and the code refuses to mark a real alert as notified.
- **`POST /api/sms` returns 501.** `src/sms/twilio.ts` and `src/sms/textbelt.ts` are empty stubs and the SMS command handler (`handleInboundSms`) does not exist yet. The planned commands (`MISSING`, `FOUND`, `SEARCH`, `STATUS`, `HELP`) are not implemented.
- **Phone numbers are US only (+1)** for now. The schema stores E.164 and is not US-specific.
- The Nepal replay has no discharge series. Nearby hospitals and shelters, a worldwide GDACS layer and a full hydrodynamic model are not built.
- The alert migration (`src/db/migrations/0002_*`) must be applied before the alert buttons work against a real database.

## How it works

```
map click (lat, lng)
   │
   ▼
GET /api/flood  (signed in only)
   ├─ Open-Meteo Flood API: 9 neighbouring 0.05° cells, history from 1984 + forecast
   ├─ pick the river cell (largest mean discharge; none → "no river")
   ├─ yearly maxima → L-moment Gumbel fit → return period → severity
   └─ Nominatim: place name
   │
   ▼
browser: rise above bankfull → AWS Terrarium tiles via GET /api/dem
         → HAND (priority-flood, flow accumulation) → depth overlay on the map
   │
   ▼
admin: alert preview (SIMULATION) → verify → notify → acknowledge (logged)
```

The model code lives in `src/model/` (pure functions, tested without network). There is no live Python and no separate backend.

## Data sources and attribution

- Flood data: Open-Meteo.com / Copernicus GloFAS (river discharge, 0.05° cells, history from 1984)
- Elevation: AWS Terrain Tiles (Terrarium encoding)
- Place names: Nominatim (OpenStreetMap)
- Nepal replay: Copernicus Emergency Management Service EMSR927 and the other sources listed, with licenses, in `public/geo/nepal-2026/replay.json`

## Limits and disclaimers

- An educational simulation, not an official forecast.
- Severity is GloFAS discharge compared with its own 1984-to-present history; GloFAS is a model, not a gauge reading.
- Depth uses an assumed bankfull depth (adjustable).
- Elevation is about 30 m resolution with errors of several metres.
- Landslides, debris flows and glacial-lake floods are not represented.
- Building and population counts are estimates.
- Return periods above 40 years are capped: 42 years of data cannot resolve a 100-year event.

## Setup

Requires Node >= 20 and pnpm.

```bash
pnpm install
cp .env.example .env   # then fill in values; never commit .env
```

Environment variables (names only; see `.env.example`):

- `DATABASE_URL`: Postgres connection (we use Supabase's session pooler). Only needed for features that use the database.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: Clerk keys. `npx -y clerk@latest init --app <application_id>` or `clerk env pull` writes them to `.env`.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `TWILIO_*`, `TEXTBELT_API_KEY`, `SMS_PROVIDER`: reserved for the SMS adapters, which are not implemented yet.

To make someone an admin, set `publicMetadata.role` to `admin` on their Clerk user (from the Clerk dashboard or Backend API).

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm test              # Vitest, single run
pnpm test:watch
pnpm db:generate       # after editing src/db/schema.ts
pnpm db:migrate        # applies migrations to DATABASE_URL
pnpm db:studio
pnpm db:seed           # inserts demo rows only if their names/titles are absent
```

## Tests

Built test-first. Tests never touch the network (`fetch` is mocked with fixtures) and never need Docker: `createTestDb()` in `tests/db.ts` returns a fresh in-memory PGlite Postgres with every migration applied. Records are never deleted; `sms_log`, alert events and edit histories are append-only.

## Team workflow

Two agents share this repo. **Grok** plans and writes the failing unit tests first; **Claude** writes the implementation that makes them pass and does not edit the tests. Handoff files are in `docs/grok/` (`plan.md`, `status.md`, briefs). Shared rules are in `AGENTS.md`.

## Layout

- `src/app` routes and pages · `src/core` domain logic and permissions · `src/model` flood maths and data access
- `src/db` schema and migrations · `src/sms` provider interface and stubs · `public/geo` static GeoJSON and replay data
- `tests` Vitest suites · `docs/grok` plans, briefs and status log
