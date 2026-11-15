# Brief for Grok: the Dashboard (worldwide flood desk), branch `dashboard`

Written by Claude from the approved plan and five research reports (2026-11-14). **Grok: turn this into behaviors with acceptance criteria in `plan.md`, then write the failing tests first. Claude implements after they are red. Claude does not write or edit tests.** Keep `src/proxy.ts` and `tests/clerk-gate.test.ts` as they are. Tests must never hit the network: use fixtures and a mocked `fetch`.

## What we are building

A Dashboard tab for a 24-hour hackathon demo: click anywhere on a world map, see real river data, a severity, a water-fill simulation on real terrain, a replay of the **Nepal flood of 26 Aug 2026**, and a **simulated** emergency-alert pipeline. Honest by design: every simulated thing is labeled SIMULATION; nothing real is sent in v1.

## Decisions already made

- Worldwide by map click. Data: Open-Meteo Flood API (GloFAS river discharge, 0.05 degree cells, history from 1984), Open-Meteo forecast/archive (rain, soil moisture), AWS Terrarium elevation tiles, Nominatim for the place name. All keyless.
- The 26 Aug 2026 Nepal event (Bhote Koshi / Trishuli, Rasuwa) was a rock-and-ice slope failure. GloFAS and rain data show no spike. The replay is a documented timeline with data panels and the Copernicus EMS EMSR927 footprint. It is **not** an animated river rise, and the screen must say so. Respectful presentation (over 1,400 dead): no gamified visuals, every figure carries a source and an "as of" date.
- Alerts are **on-screen only** in v1: the exact SMS and voice script in a phone preview, labeled SIMULATION. No provider is ever called. Verify and notify are **admin-only**.
- Stretch, not v1: nearby hospitals/shelters (OSM), a GDACS worldwide alerts layer, wrapping ANUGA.

## Pure functions to specify and test (suggested names; Grok may refine and flag disagreements in `status.md`)

### `src/model/gumbel.ts`

- `annualMaxima(days: string[], values: (number|null)[]): number[]`: one maximum per calendar year (UTC, from the ISO date prefix), ignoring null values, **excluding years with fewer than 300 valid days** (the current year is partial).
- `lMoments(values: number[]): { l1: number; l2: number }`: l1 = mean. With values sorted ascending x(1..n): b1 = (1/n) * sum over i of ((i-1)/(n-1)) * x(i), l2 = 2*b1 - l1.
- `fitGumbel(annualMax: number[]): { mu: number; beta: number } | null`: beta = l2 / ln 2, mu = l1 - 0.5772156649 * beta. Returns `null` for fewer than 10 values or beta <= 0.
- `quantile(T: number, fit): number`: Q_T = mu - beta * ln(-ln(1 - 1/T)), for T > 1.
- `returnPeriod(q: number, fit): number`: T = 1 / (1 - exp(-exp(-(q - mu)/beta))). Always >= 1 and monotonic in q. `quantile` and `returnPeriod` are inverses.
- `capReturnPeriod(T: number): { value: number; capped: boolean }`: the display cap is **40 years** (value 40, capped true when T > 40). Forty-two years of data cannot resolve a 100-year event.
- `empiricalReturnPeriod(q: number, annualMax: number[]): number`: Weibull, T = (n + 1) / rank, rank = 1 + number of maxima strictly greater than q.

### `src/model/severity.ts`

- `type Severity = 'normal' | 'watch' | 'warning' | 'severe' | 'unknown'`.
- `severityFromReturnPeriod(T: number): Severity`: **normal below 2, watch 2 up to (not including) 5, warning 5 up to 20, severe 20 and above.** Test the exact boundaries (1.999, 2, 4.999, 5, 19.999, 20).
- `classifyDischarge(q: number, annualMax: number[])`: `{ severity, returnPeriod, capped, q2 }`. Fewer than 10 usable maxima gives `severity: 'unknown'` and never a number. `q2 = quantile(2, fit)`.

### `src/model/rise.ts`

- `riseAboveBankfull(q, q2, opts?: { bankfullDepth?: number; exponent?: number }): number` = `max(0, h * ((q / q2) ** k - 1))`, defaults **h = 2 m, k = 0.5**. Zero at or below q2 (continuous at q2), monotonic increasing above it, 0 when q2 <= 0 or q is not finite. Example: q = 5 * q2 gives about 2.48 m with the defaults.

### `src/model/terrarium.ts`

- `decodeTerrarium(r, g, b): number` = r*256 + g + b/256 - 32768. (128,0,0) is 0 m. (133,14,0) is 1294 m (Kathmandu valley).
- `tileForLatLng(lat, lng, z): { x: number; y: number }` standard Web Mercator slippy-map tile. Kathmandu (27.70, 85.32) at z12 is x=3018, y=1719.
- `groundResolution(lat, z): number` = 156543.03392 * cos(lat) / 2^z metres per pixel. About 33.8 m at 27.7 N, z12.
- `tilesForWindow(lat, lng, halfWidthKm, z)`: every tile covering the window; sensible tile counts (about 4-9 for a 10 km window at z12-13).

### `src/model/hand.ts` (Height Above Nearest Drainage)

A flat "bathtub" would flood unconnected hollows and ignore the river's slope, so we use HAND. Grid type `{ width, height, elevation: Float32Array }`.

- `computeHand(grid, { streamThresholdCells }): { filled, hand, accumulation, isStream, receiver }`: priority-flood fill (Barnes 2014) from the edges with a tiny epsilon; flow accumulation by processing cells in reverse pop order; stream cells where accumulation >= the threshold; **HAND = filled elevation minus the elevation of the stream cell the cell drains to** (filled, not original, so a closed pit behind a ridge is treated as sitting at its spill level). Cells that never reach a stream get `Infinity`.
- `findSeed(accumulation, isStream, width, height, x, y, radiusCells): number`: the stream cell with maximum accumulation within the radius (use ~3 km worth of cells from a GloFAS point, ~300 m for a click on the river); -1 if none.
- `depthGrid(hand, rise): Float32Array`: `rise - hand` where `hand < rise`, otherwise 0.
- **Must-pass fixtures** (hand-made small grids): a V-shaped valley with the river down the centre (depth shrinks with distance and is exactly 0 outside the wet band); a **disconnected pit** behind a ridge stays **dry until the rise exceeds the ridge height above the stream**; a flat plain; a grid with no stream (all dry, no crash); a single column; determinism (same input gives same output).

### `src/model/openMeteo.ts` and the data route

- `floodUrl({ lat, lng, startDate?, endDate?, pastDays?, forecastDays? })`: base `https://flood-api.open-meteo.com/v1/flood`, `daily=river_discharge`, comma-separated coordinates when several.
- `neighbourCoordinates(lat, lng)`: the 3x3 grid at +-0.05 degrees (9 points, centre first) used to find the right river, because cells snap to the wrong river.
- `parseFloodResponse(json)`: single or array responses; `{ error: true, reason }` throws a typed error; null discharge preserved.
- `pickRiverCell(cells, click)`: the cell with the largest mean discharge; ties go to the nearest to the click; if every cell is null or zero, **no river** (`null`).
- Route `GET /api/flood?lat&lng` returns `{ snapped: {lat,lng}, noRiver, series: {days, discharge}, climatology: { years, q2, fit }, current: { discharge, returnPeriod, capped, severity, peakDate }, place?, attribution }`. Refuses invalid coordinates (400: lat outside -90..90, lng outside -180..180, NaN, missing) and signed-out callers. Mock Clerk and `fetch`.
- Route `GET /api/dem?z&x&y` proxies the Terrarium tile with long cache headers; validates z (10-14), x, y ranges; signed-in only.

### Alert pipeline (`src/core/alerts/`)

- `buildAlertMessage({ place, severity, returnPeriod, capped, peakDate, simulated }): { sms, voiceScript }`. Rules: when simulated both start with `SIMULATION ONLY:`; mention the place and the severity word; one generic safety line ("move away from rivers and low ground and follow local authorities"); SMS <= 320 characters, plain ASCII, no emoji; **never** the words WEA, NWS, "Wireless Emergency Alert" or any claim to be official; returns a different, more cautious text for severity `unknown`.
- State machine `detected -> verified -> notified -> acknowledged`, in order, no skipping, nothing after `acknowledged`. `canSendAlert(actor)` in `src/core/permissions.ts` is admin only. `advanceAlert(alert, to, actor)`: every transition is admin only (`forbidden` otherwise), refused out of order, and `kind: 'real'` alerts are refused at `notified` in v1 (`real_sends_disabled`). Each transition returns an event for the append-only log. Simulated alerts are always flagged.
- Schema (Claude generates the migration after the tests exist; Grok may adjust): `flood_alerts` (id, kind `simulated|real`, place, lat, lng, severity, return_period, status, created_by_user_id, created_at, updated_at) and `flood_alert_events` (id, alert_id, kind, actor_user_id, message, created_at), both append-only (no deletes). Tests that need these tables stay red until then.

### Replay data (`public/geo/nepal-2026/replay.json`, built by a script)

A `validateReplay(json)` guard: every series has `source` and `asOf`; no negative rainfall or discharge; timeline entries sorted ascending with a source each; every impact figure has `label, value, asOf, source`; a non-empty `limitations` array that includes a statement about debris flows and landslide-dam or glacier events not being visible to river models; sources list with url and license. Known facts the fixture may use: onset 26 Aug 2026 02:52 UTC, barrier-lake overflow 28 Aug, search and rescue ended 5 Oct; GDACS event 1104124 (Red); EMSR927 (six areas, 1,580 ha, about 7,600 people, 4,685 buildings); BIPAD Galchi river station (id 281) readings only from 28 Aug.

## UI contract (markup/source tests)

- `src/app/dashboard/page.tsx` is a Server Component: contains `<Suspense` and `ListSkeleton`, awaits no data directly, and does **not** contain `ssr: false`; a `loading.tsx` exists (title text paints at once). A separate client file `FloodMapLoader.tsx` contains `dynamic(` and `ssr: false`.
- A visible mode switch with `Live` and `Replay: Nepal Aug 2026`; a persistent badge reading `LIVE`, `REPLAY` or `SIMULATION`; the six disclaimers on screen: educational simulation not an official forecast; severity is GloFAS discharge compared with its own 1984-present history; depth uses an assumed bankfull depth (adjustable); elevation is about 30 m with errors of several metres; landslides, debris flows and glacial-lake floods are not represented; building and population counts are estimates.
- Palette/design rules: use the existing tokens; water uses a teal ramp only (amber and red only on the severity badge); sharp edges.
- Admin-only actions call `requireAdmin()` first (mock `@/lib/roles`); a non-admin gets a refusal and nothing is written.

## Test ideas, in suggested order

Severity boundaries; Gumbel fit/quantile/returnPeriod round trip on a fixed synthetic series and the 40-year cap; empirical Weibull; annualMaxima (null handling, partial year dropped); rise formula (zero at q2, continuity, monotonic, defaults, bad input); Terrarium decode and tile maths (Kathmandu); HAND fixtures above; findSeed; Open-Meteo URL building, parsing with fixtures, picking the river cell and the no-river case; route validation and auth; alert message rules and the forbidden-word check; state machine and permissions; replay validator; page source constraints.

## Out of scope for v1

Real SMS/call/Telegram sends, OSM hospitals/shelters, the GDACS worldwide layer, ANUGA, program/missing-person changes.
