# Brief for Grok: a real flood engine behind the Flood Desk (SFINCS in Docker)

Written by Claude from the approved plan (2026-11-15). **Grok: turn this into behaviors with acceptance criteria in
`plan.md`, then write the failing tests first. Claude implements after they are red. Claude does not write or edit
tests.** Tests never hit the network or run Docker: mock `fetch` and the engine.

## Why

The desk's water layer is a static HAND + Manning estimate (`src/model/hand.ts`, `src/model/rating.ts`,
`src/app/dashboard/hand.worker.ts`). It is instant but does not move water. We add an optional "full simulation"
run on **SFINCS** (Deltares, GPL-3.0, peer-reviewed, official image `deltares/sfincs-cpu`), with the model built
for any area by **HydroMT-SFINCS** from global open data. The HAND layer stays as the instant preview and the
fallback.

## Pieces

### 1. `engine/` (new, Python, its own Dockerfile; not part of the Next build)

- Base `deltares/sfincs-cpu`, plus `hydromt_sfincs` and FastAPI. Runs on a Docker host (Render, Fly or Railway), not
  Vercel. GPL code stays in this service; the app talks to it over HTTP only.
- `GET /health` → `{ ok: true, sfincs: "<version>" }`.
- `POST /simulate`, request:
  `{ bbox: [west, south, east, north], inflow: { lat, lng, times: string[] /* ISO */, discharge: number[] /* m3/s */ }, hours: number, resolution?: number /* m, default 100 */ }`.
  Limits: bbox at most 20 x 20 km, `hours` 1 to 72, `times.length === discharge.length` with at least 2 values,
  every discharge finite and >= 0, inflow point inside the bbox. Otherwise 400 `{ error: "<reason>" }`.
- Response 200:
  `{ id, bbox, bounds: [south, west, north, east], width, height, resolution, maxDepth: { url, scaleMax }, stats: { floodedKm2, maxDepthM, runSeconds }, attribution }`.
  `maxDepth.url` (`/runs/{id}/maxdepth.png`) serves an RGBA PNG already coloured with the desk's teal ramp
  (0 → `RAMP_SHALLOW`, `scaleMax` → `RAMP_DEEP`, at or below 0.05 m transparent), warped to Web Mercator over the bbox
  so a Leaflet image overlay with `bounds` lines up exactly.
- As built (2026-11-15), the engine does not use HydroMT. It writes SFINCS ASCII inputs itself: Copernicus GLO-30
  elevation and ESA WorldCover → Manning n come from public AWS COGs. The river is found with D8 routing on the
  filled DEM, and the inflow goes in where the river enters the box (walking upstream from the click). The box
  edges are outflow cells. The app sends the flow **above the river's median flow**, because the DEM shows the
  water surface, not the bed.
- `x-engine-key` must equal `ENGINE_SECRET` when that is set (both `/simulate` and the PNG).
- The result is cached by a hash of the normalized request. The same request returns the same `id` and does not
  rerun.
- A run longer than 180 s → 504 `{ error: "timeout" }`.
- Python tests for the engine (Grok's call: pytest inside `engine/tests`, SFINCS mocked) cover validation, the
  cache key and the response shape.

### 2. `src/model/engine.ts` (pure, TypeScript)

- `buildSimulateRequest(flood, scenario, { halfWidthKm = 5 })`: from the `/api/flood` payload (snapped point, series
  or forecast) and the chosen scenario flow, returns the request above. The bbox is centred on the snapped point
  and clamped to the 20 km limit. The hydrograph rises linearly from the current flow to the scenario peak over
  `hours / 2`, then holds.
- `validateSimulateResponse(json)`: typed guard; rejects missing fields, negative stats or a bbox that doesn't
  match the request.
- `depthFromPixel(value, scaleMax)`: 0..255 → metres.

### 3. `GET`/`POST /api/simulate` (`src/app/api/simulate/route.ts`)

- Signed-in only (mock `@clerk/nextjs/server`). Proxies to `process.env.ENGINE_URL`.
- No `ENGINE_URL`, engine unreachable or 5xx → 503 `{ error: "engine_unavailable", fallback: "hand" }`.
- Passes engine 400s through as 400. Validates the body with the same rules before calling the engine (no call is
  made for a bad body).
- Never forwards cookies or Clerk tokens to the engine.

### 4. Desk UI (markup/source tests)

- `ScenarioPanel.tsx`: a **Run full simulation** button, disabled while running, with the label
  `Running SFINCS…` and elapsed seconds.
- `FloodMap.tsx`: draws the SFINCS depth PNG as an image layer over the bbox with the existing teal ramp
  (`RAMP_SHALLOW`/`RAMP_DEEP` in `ramp.ts`); the layer is labelled **SFINCS model run** versus **Quick estimate
  (HAND)**. When the route returns `engine_unavailable`, the HAND layer stays and a notice reads "Full simulation
  is offline; showing the quick estimate."
- `Disclaimers.tsx` keeps its six items; add the SFINCS attribution line under the map when that layer is shown.

## Out of scope

`/api/sms`, `/api/postsms`, `src/proxy.ts` (`/api/simulate` stays behind login like `/api/flood`) and the DB
schema. Optional later: show the langtang-2026-cascade v2 model frames (MIT, H. Park) in the Nepal replay, labelled
"model reconstruction".
