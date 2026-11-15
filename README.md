# Flood Response

A flood desk for anywhere in the world, plus the tools a community needs after a flood: a registry of missing people and a list of community programs. Built for a 24-hour hackathon.

**Problem.** Flood warnings are hard to read and hard to act on. Raw river data does not say "is this normal or dangerous?", and after a disaster, families searching for each other have no single place to look.

## What exists today

- **Flood desk (`/dashboard`).** Click anywhere on a world map and the server fetches simulated river flow for that point from **GEOGloWS ECMWF Streamflow** (primary) or **Open-Meteo / Copernicus GloFAS** (fallback when GEOGloWS fails). Severity (`normal`, `watch`, `warning`, `severe`) compares the flow with that river's own 1984-to-present history (hydrological-year maxima, L-moment Gumbel fit; boundaries at 2, 5 and 20 years; display capped at 40 years). Fewer than 10 yearly maxima gives `unknown`, never a made-up number. The first click on a new river can take 20 to 60 seconds; after that its history is cached.
- **Water-fill simulation.** Depth comes from a Manning rating curve built on real terrain with a HAND model (height above nearest drainage), so hollows behind ridges stay dry. Channel roughness is adjustable, and depths are shown as a likely range.
- **Experiments.** Pick a forecast day, a 2 to 100-year flood, a flow multiplier, or a breach what-if (peak envelope, no wave travel time), save one scenario and compare it with another using a swipe divider.
- **Public demo (`/demo`).** Five preset rivers from saved data, no sign-in needed. Rebuild the saved data with `node scripts/build-demo.mjs` (add `--force` to refresh presets already saved).
- **Nepal replay.** A documented timeline, sources and impact figures for the 26 Aug 2026 Rasuwa event (Bhote Koshi / Trishuli), including the Copernicus EMS EMSR927 figures. It is **not** an animated river rise: that event was a slope and ice failure that river and rain data do not show, and the screen says so.
- **Simulated alert pipeline.** The exact SMS and voice script appear in an on-screen phone preview, labelled `SIMULATION ONLY`. Admins move an alert through `detected → verified → notified → acknowledged`; steps are logged in an append-only table.
- **Missing People (`/missing`).** Report, search (any word order, accent-insensitive), mark found, suggest edits. Contact details are visible only to admins and the reporter.
- **Community programs (`/communities`).** Search by category, host programs, register and cancel.
- **Admin (`/admin`).** Approval queues for programs and edit suggestions, direct edits with history, re-open found records, attendee lists, user management. Role is Clerk `publicMetadata.role === 'admin'`, checked on the server for every page and action.
- **Auth.** Clerk, with our own sign-in and sign-up forms. Every page requires login except `/sign-in`, `/sign-up`, `/api/sms` and `/geo/*`.

## What is simulated or not built

- **No real alert, SMS or call is ever sent.** Alerts are on-screen only, and the code refuses to mark a real alert as notified.
- **No real SMS is sent or received.** `POST /api/sms` returns 501 and `src/sms/twilio.ts` / `src/sms/textbelt.ts` are empty stubs. The command core (`handleInboundSms`: `HELP`, `SEARCH`, `MISSING`, `FOUND`, `STATUS`) exists and is reachable only through the on-screen `/sms-simulator`.
- **Phone numbers are US only (+1)** for now. The schema stores E.164 and is not US-specific.
- The Nepal replay has no discharge series. Nearby hospitals and shelters, a worldwide GDACS layer and a full hydrodynamic model are not built.
- Two migrations are not applied to the real database yet: `0002_*` (flood alert tables; the admin alert buttons need it) and `0003_*` (the `flood_climatology` cache; without it the flood desk uses an in-memory cache only).

## How it works

```
map click (lat, lng)
   │
   ▼
GET /api/flood  (signed in only)
   ├─ database cache (flood_climatology): stored yearly maxima for this spot? → skip the history download
   ├─ GEOGloWS (primary): look up the reaches at 9 points within ~3 km, keep the one with the
   │    largest recent flow, download its daily history from 1984 once, plus 15-day forecast statistics
   ├─ Open-Meteo / GloFAS (fallback if GEOGloWS fails): 9 cells for 60 days to pick the river,
   │    then that one cell's history from 1984 + forecast
   ├─ hydrological-year maxima → L-moment Gumbel fit → return period → severity
   └─ Nominatim: place name
   │
   ▼
browser: AWS Terrarium tiles via GET /api/dem → HAND (priority-flood, flow accumulation, in a
         Web Worker) → Manning rating curve for the chosen flow → depth overlay on the map
   │
   ▼
admin: alert preview (SIMULATION) → verify → notify → acknowledge (logged)
```

The model code lives in `src/model/` (pure functions, tested without network). There is no live Python and no separate backend.

## Data sources and attribution

- River flow (primary): GEOGloWS ECMWF Streamflow v2, CC BY 4.0, keyless (reach-based model driven by ERA5 and ECMWF ENS; daily history from 1940, of which we use 1984 onward; 15-day forecast statistics)
- River flow (fallback): Open-Meteo.com / Copernicus GloFAS (river discharge, 0.05° cells, history from 1984)
- Cache: yearly maxima per spot are stored in the `flood_climatology` table (migration `0003`) so each river's history is downloaded once. Without that migration the route still works, using an in-memory cache only.
- Elevation: AWS Terrain Tiles (Terrarium encoding)
- Place names: Nominatim (OpenStreetMap)
- Nepal replay: Copernicus Emergency Management Service EMSR927 and the other sources listed, with licenses, in `public/geo/nepal-2026/replay.json`

## Limits and disclaimers

- An educational simulation, not an official forecast.
- Severity compares simulated river flow (GEOGloWS, or GloFAS as a fallback) with its own 1984-to-present history. Both are models, not gauge readings.
- GEOGloWS returns the nearest river reach without its position, and the nearest reach can be a small side channel. The app therefore checks the reaches within about 3 km and uses the largest; check the river name against the map.
- The hosted GEOGloWS return-period endpoint returned server errors when tested, so return periods come from our own Gumbel fit of the history.
- GEOGloWS and Open-Meteo both rate-limit bursts of requests. The app spaces and retries its GEOGloWS calls and caches results; heavy clicking can still hit a limit for a while.
- Depth uses an assumed channel roughness and a slope read from the terrain (bankfull is estimated, not surveyed), so it is a likely range.
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
