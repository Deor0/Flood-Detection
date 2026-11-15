# Helpline API

One public endpoint files a missing-person report and looks a name up. It was built for a voice agent (Vapi), and any other client can call the same URL. There is no API key and no login.

`POST /api/sms` is a separate stub and still returns `501`.

## Endpoint

`POST /api/postsms`

The path is public. Clerk does not protect it. Send `Content-Type: application/json`.

| Status | When |
| --- | --- |
| 200 | The body parsed. A tool result can still say the report was refused. |
| 400 | The body is not JSON. `{ "error": "invalid_json" }` |

Any message whose `type` is not `tool-calls` returns `{ "ok": true }` and writes nothing. That covers Vapi events such as `status-update` and `end-of-call-report`.

## Envelope

```json
{
  "message": {
    "type": "tool-calls",
    "toolCallList": [
      {
        "id": "call-1",
        "name": "report_missing_person",
        "arguments": { "name": "Sarah Jenkins" }
      }
    ],
    "call": { "customer": { "number": "+977 984-1234567" } }
  }
}
```

`toolCalls` is accepted in place of `toolCallList`. Inside that list, the name and arguments may sit on `function.name` and `function.arguments` instead. `arguments` may be an object or a JSON string.

`call.customer.number` is the caller. A valid number in any country is stored in E.164. A missing or invalid number is stored as null. The report is still saved.

The response is one result per tool call. `result` is a JSON string.

```json
{
  "results": [
    { "toolCallId": "call-1", "result": "{\"ok\":true,\"publicId\":\"REG-01001\",\"name\":\"Sarah Jenkins\",\"status\":\"missing\"}" }
  ]
}
```

## report_missing_person

Creates one `missing_persons` row and one `reported` event. The same row is appended to `data/helpline-reports.json` (or `HELPLINE_REPORTS_FILE` when that variable is set). That file is gitignored.

| Field | Required | Stored as |
| --- | --- | --- |
| `name` | yes | `name`. Also `nameNormalized`, for search. |
| `age` | no | `age`. Whole number from 0 to 120. |
| `lastKnownLocation` | no | `last_seen_location`. At most 200 characters. |
| `description` | no | `notes`. At most 1000 characters. |
| caller number | no | `reporter_phone`, from the envelope, not from these arguments. |

The system fills the rest:

- `id` — new UUID
- `public_number` — next registry number, returned as `REG-01001`
- `status` — `missing`
- `created_at` and `updated_at` — the time of the insert
- `lat`, `lng`, `contact`, and the found-person columns — null

A name shorter than 2 characters, longer than 100, or only spaces is refused. Nothing is written.

```json
{ "ok": false, "error": "invalid", "fields": { "name": "Enter the full name." } }
```

A bad age is the same `invalid` error, with `fields.age`. The same phone number can file 10 reports in 24 hours. The 11th returns `{ "ok": false, "error": "rate_limited" }` and writes nothing. A report with no phone number is not counted against that limit.

Success:

```json
{ "ok": true, "publicId": "REG-01001", "name": "Sarah Jenkins", "status": "missing" }
```

`name` in the response is the trimmed name.

### Example

```bash
curl -s -X POST http://localhost:3000/api/postsms \
  -H 'content-type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "report-1",
        "name": "report_missing_person",
        "arguments": {
          "name": "Sarah Jenkins",
          "age": 34,
          "lastKnownLocation": "Westside Community Center, Houston",
          "description": "Blue jacket, needs insulin"
        }
      }],
      "call": { "customer": { "number": "+1 415 555 2671" } }
    }
  }'
```

The JSON file then holds one object with every column. Unset fields are `null`.

```json
{
  "id": "generated-uuid",
  "publicNumber": 1001,
  "name": "Sarah Jenkins",
  "nameNormalized": "sarah jenkins",
  "age": 34,
  "lastSeenLocation": "Westside Community Center, Houston",
  "lat": null,
  "lng": null,
  "notes": "Blue jacket, needs insulin",
  "contact": null,
  "status": "missing",
  "reporterUserId": null,
  "reporterPhone": "+14155552671",
  "foundByUserId": null,
  "foundByPhone": null,
  "foundNote": null,
  "foundAt": null,
  "createdAt": "2026-11-14T12:00:00.000Z",
  "updatedAt": "2026-11-14T12:00:00.000Z"
}
```

## check_missing_person

Looks up a name. It does not write a row or a JSON record. The only argument is `name`.

```json
{ "ok": true, "matches": [] }
```

A usable name returns at most 3 matches:

```json
{
  "ok": true,
  "matches": [
    {
      "publicId": "REG-01001",
      "name": "Sarah Jenkins",
      "status": "missing",
      "region": "Houston"
    }
  ]
}
```

What a match contains:

- `status` is `missing` or `found`.
- `region` is the part after the last comma in the last-seen place, or the first 24 characters when there is no comma.
- A person under 18 is returned as initials (`Sam Rai` becomes `S. R.`).
- Contact, notes, age, coordinates, and the full street are not returned.
- A name shorter than 2 searchable characters returns an empty list. It does not list the registry.

Every word must appear in the name. Order does not matter. `jenkins sarah` finds `Sarah Jenkins`.

```bash
curl -s -X POST http://localhost:3000/api/postsms \
  -H 'content-type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "check-1",
        "name": "check_missing_person",
        "arguments": { "name": "Sarah Jenkins" }
      }]
    }
  }'
```

## Other tool names

An unknown name, including `check_flood_status` and `find_relief_shelters`, returns HTTP 200 and:

```json
{ "ok": false, "error": "unknown_tool" }
```

Nothing is written.

## What this route does not do

- It does not send an SMS or start a phone call.
- It does not require `VAPI_WEBHOOK_SECRET`. That check was removed on purpose for the demo.
- It does not delete reports. A row stays in `missing_persons` and moves to `found` through the website, not through this route.
