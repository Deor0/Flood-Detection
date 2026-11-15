# Brief for Grok: demo fixes before judging (branch `dashboard`, 2026-11-14)

Written by Claude from a judge-style review the user approved. Under 6 hours to judging. **Grok: write failing tests for slices 1, 4, 5 and 6 first; Claude implements after they are red.** Slices 2 and 3 are mostly browser/perf work with thin test surface; tests are welcome but Claude may start them in parallel. Don't change `src/proxy.ts` without the user's OK (slice 5 needs it).

User decisions: SMS is shown with an **on-screen simulator** (no provider is called). Public missing-person search is **status only**. Phones stay **US only (+1)**.

## Slice 1 — forecast-first severity (`src/app/api/flood/route.ts`, `FloodDesk.tsx`, `AlertPanel.tsx`)
- `current.peakDate` and `peakDischarge` come only from days **after today (UTC)**; never a past date. If no forecast days, `peakDate: null`.
- Add `forecast: { peakDischarge, peakDate, daysAhead, returnPeriod, capped, severity }`. Headline severity = worse of today and forecast peak.
- `current.dischargeDate`: the date the "today" value is from.
- When history is unknown (fewer than 10 maxima), the UI says "not enough history", never "at or below the 2-year level".
- No alert preview or "record alert" for `normal` severity.
- Test ideas: fixture with a past spike and a future smaller peak → peakDate is the future date; future 20-year peak with normal today → severity `severe`; no forecast → peakDate null.

## Slice 2 — demo visibility (`FloodMap.tsx`, `water.ts`, new worker)
- After a click with a river, fly to zoom 12-13 on the snapped cell.
- "Try Rasuwa" button (Trishuli/Bhote Koshi near 28.17, 85.33) that runs the same flow.
- HAND runs in a Web Worker; bankfull slider is debounced; shallow water colour must differ from OSM water.

## Slice 3 — server cache (`api/flood/route.ts`)
- In-memory cache of the parsed Open-Meteo history per rounded coordinate, TTL 6 h; 8 s timeout (502 with a reason); Nominatim in parallel with a descriptive User-Agent, cached.
- Test ideas: two calls for the same point call `fetch` for Open-Meteo once; a hung fetch yields 502.

## Slice 4 — SMS core + simulator (`src/core/sms/*`, `src/app/sms-simulator/*`)
- `handleInboundSms(db, { from, body, receivedAt }) → { reply, notifications }` per CLAUDE.md. Commands (case-insensitive): `HELP`; `SEARCH <name>` (status + region only, never contact/age/notes); `MISSING <name>, <location?>, <age?>` (uses `reportMissing` with `actor.phone`); `FOUND <name>` (only the reporter phone may mark their own record; otherwise reply how to ask an admin); `STATUS <place>` (simulated text: "use the web desk", no network in tests). Unknown → help text. Every message appended to `sms_log` (in and out).
- Phone normalized to E.164, +1 only; non-US → polite refusal reply.
- Reply plain ASCII, ≤ 320 chars.
- `/sms-simulator` page (signed in): type as a phone number, see the reply; labelled SIMULATION. `/api/sms` stays 501.

## Slice 5 — landing page + public search (`src/app/page.tsx`, `src/app/find/*`, `src/proxy.ts`)
- `/` public: problem, how severity and the water fill work, Nepal Aug 2026 case study, honest limits, sign-in link.
- `/find` public: name search returning only `{ publicId, name, status, region }`; no age, notes, contact, found note or location detail; if age < 18, show initials only.
- Proxy public list gains `/` (exact) and `/find(.*)`; update `tests/clerk-gate.test.ts` accordingly (needs the user's OK).

## Slice 6 — small safety + housekeeping
- Mark-found needs a confirm step in the UI, and the server refuses a second mark-found per user per 10 minutes (test it).
- Fix `tests/admin-edits.test.ts` "stops one user at 10 pending suggestions": the shared `reporter` hits the 10 reports/24h cap on the 11th report. Use a separate reporter or an admin reporter.
- README rewrite (Claude).
