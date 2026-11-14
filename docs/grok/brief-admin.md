# Brief for Grok: admin role, supervised changes, admin dashboard (branch `admin-dashboard`)

Written by Claude on the user's decisions (2026-11-14), after three read-only reviews of every tab. **Grok: turn this into behaviors with acceptance criteria in `plan.md`, then write the failing tests. Claude implements after the tests exist.** Auth is Clerk. Keep `src/proxy.ts` and `tests/clerk-gate.test.ts` as they are.

## Goal

People cannot change shared data without supervision, and admins get a dashboard to review, correct and audit. The owner of a post can change that post directly.

## Roles and who may do what

- **Admin:** Clerk `publicMetadata.role === "admin"` (backend-writable only). Never use `unsafeMetadata` (the sign-up form writes it). The role reaches the server through a Clerk session claim (`sessionClaims.metadata.role`).
- **Owner:** the user whose Clerk id is on the post (`missing_persons.reporter_user_id`, `programs.created_by_user_id`).
- **Everyone else:** any other signed-in user.

| Action                                      | Admin                 | Owner                                 | Other user                                              |
| ------------------------------------------- | --------------------- | ------------------------------------- | ------------------------------------------------------- |
| Edit a missing-person record                | direct, audited       | direct, audited                       | **Suggest an edit** (pending request, record unchanged) |
| Approve/reject an edit request              | yes                   | no                                    | no                                                      |
| Mark found                                  | yes                   | yes                                   | yes (immediate, as today)                               |
| Re-open a found record                      | yes (reason required) | **no**                                | no                                                      |
| See `contact` on a missing record           | yes                   | yes                                   | **no** (server strips it; not sent to the client)       |
| See history timeline of a record            | yes                   | no                                    | no                                                      |
| Create a program                            | auto-approved         | submitted as **pending**              | submitted as **pending**                                |
| Edit / cancel a program                     | any program           | own program, **live at once**, logged | no                                                      |
| Approve/reject a program (reason on reject) | yes                   | no                                    | no                                                      |
| Register for a program                      | approved only         | approved only                         | approved only (pending/rejected/cancelled refused)      |
| See pending/rejected programs               | all                   | own (with status and reason)          | no                                                      |
| Attendee list, user management, `/admin/*`  | yes                   | no                                    | no                                                      |

Every admin page, server action and route handler must check the role on the server (`requireAdmin()`); hiding the nav link is cosmetic.

## Limits

- Reports: at most **10 per user per rolling 24 hours** (admins exempt); refuse with a clear message. At most **5 pending programs per user**.
- Records are never deleted. Rejecting or cancelling sets a status and keeps the row.

## Schema (Claude generates the migration; Grok may adjust)

- `programs`: add `status` (`pending|approved|rejected|cancelled`, default `pending`), `reviewed_by_user_id`, `reviewed_at`, `rejection_reason`, `updated_at`. Existing rows (the demo seed) become `approved`.
- `program_events` (append-only): `id, program_id, kind (submitted|approved|rejected|edited|cancelled), actor_user_id, reason, changes jsonb, created_at`. Owner edits log `{field:{from,to}}`.
- `missing_person_edit_requests`: `id, missing_person_id, submitted_by_user_id, base_updated_at, proposed jsonb, status (pending|approved|rejected), reviewed_by_user_id, reviewed_at, reject_reason, created_at`.
- `missing_person_events.kind` adds `reopened`, `edit_requested`, `edit_approved`, `edit_rejected`, plus an optional `reason`.

## Core functions (pure, take a `db` and an actor, PGlite-testable; suggested names)

- Roles: `src/lib/roles.ts` `isAdmin(sessionClaims)`, `requireAdmin()`.
- Programs (`src/core/programs/service.ts`): `createProgram` (pending, or approved for admins, with the pending cap), `listPrograms` (approved only), `listMyPrograms`, `listPendingPrograms`, `approveProgram`, `rejectProgram(reason)`, `editProgram` (host or admin), `cancelProgram` (host or admin), `registerForProgram` (adds a `not_open` refusal), `listAttendees` (ids only in the core; names/emails are added by a Clerk lookup in the action layer, which tests mock).
- Missing (`src/core/missing/service.ts`): `editMissing` allowed for admin or reporter, otherwise refused; `requestEdit`; `listEditRequests`; `approveEditRequest` (applies the proposal, reports `stale: true` when the record changed since `base_updated_at`, never silently drops the diff); `rejectEditRequest(reason)`; `reopenMissing` (admin only); `missingHistory` (exists); the report rate limit inside `reportMissing`.
- Redaction: a pure function that removes `contact` from a record for viewers who are neither admin nor the reporter.

## Small bug to fix in the same slice

`cancelAction` (`src/app/communities/actions.ts`) always returns "Registration cancelled." even when `cancelRegistration` reports `{ ok: false }` (no active registration). It should say there was nothing to cancel. Please add a test for the message in both cases. Also confirm a stale error stays cleared after a later successful register/cancel click.

## Name search fix (bug found in review)

`normalizeName` currently deletes every character outside `a-z0-9`, so names in Arabic, Tamil, Sinhala, Chinese and similar become an empty key, are unsearchable, and an empty-token query returns everyone. Required: keep letters and digits of any script; strip accents only on Latin letters; map `ø ł đ ß` sensibly; treat `O'Brien` and `OBrien` and `Maria de la Cruz` correctly; a **non-empty query that normalizes to nothing returns no results** (not everything). Existing rows need a one-off `name_normalized` recompute (Claude will do this only after the user approves).

## Test ideas

Permission matrix above (each cell, including refusals); admin role from session claims; a pending program is invisible to others and cannot be registered for; approve makes it public; reject keeps the row and the reason; owner edit goes live and logs before/after; non-owner edit cannot touch a program; edit request leaves the record untouched until approved, stale warning, reject reason; re-open admin-only and logged; contact redaction; rate-limit refusal and the 24 h window; non-Latin and accented names (found and not-found cases, empty-token query); concurrent approvals of the same request; nothing is ever deleted.

## UI contract (for markup tests)

`/admin` overview (pending programs, pending edit requests, user count), `/admin/programs` (queue, approve, reject with reason, edit, cancel, attendee list), `/admin/missing` (edit-request queue with a diff, direct edit, re-open, history timeline), `/admin/users` (list from Clerk, grant/revoke admin, ban/unban; cannot demote yourself or the last admin). Nav shows an **Admin** tab only to admins. Communities shows "Your programs" with status badges and reasons, and the host form says the program is "submitted for review"; the false "Verified" wording is replaced. Non-owners see "Suggest an edit" on missing records; found confirmation stays visible.

## Approvals Claude needs from the user (not Grok)

Applying the migration and the name backfill to Supabase; the Clerk session-token claim and setting the first admin's metadata; the user signs up the admin account themselves. Clerk device trust is still open and unrelated.

## Out of scope

SMS commands and `/api/sms` signature checking, program time zones, Share/Directions/Export, CSP, dropping the `users` table, phone verification and OTP.
