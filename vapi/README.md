# Vapi Voice Agent — HydroRescue Dispatch

Self-contained configuration, prompts, tool schemas, and provisioning scripts to replicate the **HydroRescue Dispatch** (Poseidon Surge Emergency Flood Helpline) Vapi voice agent.

## Folder Contents

```text
vapi/
├── README.md                        # Setup, replication, and testing guide
├── assistant.json                   # Complete Vapi assistant config (model, voice, transcriber)
├── prompts/
│   ├── first-message.txt            # Opening greeting spoken when a call connects
│   └── system-prompt.md             # Full dispatcher system prompt & guardrails
├── tools/
│   ├── check_missing_person.json    # Vapi function tool schema: registry lookup
│   └── report_missing_person.json   # Vapi function tool schema: file a missing-person report
└── scripts/
    ├── provision.mjs                # One-command script to create tools + assistant via Vapi API
    └── test-webhook.sh              # Curl smoke test for POST /api/postsms
```

## Architecture & Codebase Integration

1. **Caller -> Vapi (`HydroRescue Dispatch`)**
   - **LLM:** `openai` / `gpt-4.1`
   - **Voice:** `11labs` (`cjVigY5qzO86Huf0OWal`)
   - **Transcriber:** `soniox` / `stt-rt-v5`
   - **Tools:** `check_missing_person` and `report_missing_person`
2. **Vapi -> Next.js Webhook (`POST /api/postsms`)**
   - Route handler: [`src/app/api/postsms/route.ts`](../src/app/api/postsms/route.ts)
   - Public (excluded from Clerk auth in `src/proxy.ts`)
   - Parses either `message.toolCallList` or `message.toolCalls` and extracts `call.customer.number`.
3. **Core Helpline Handler -> Database**
   - Tool dispatcher: [`src/core/helpline/vapi.ts`](../src/core/helpline/vapi.ts)
   - Registry service: [`src/core/missing/service.ts`](../src/core/missing/service.ts)
   - Public search: [`src/core/missing/publicSearch.ts`](../src/core/missing/publicSearch.ts)
   - Full HTTP contract: [`docs/helpline-api.md`](../docs/helpline-api.md)

## Quick Replication (Automated)

Requires Node.js 20+ and a Vapi API key from [dashboard.vapi.ai](https://dashboard.vapi.ai).

```bash
export VAPI_API_KEY="your-vapi-private-api-key"
export VAPI_WEBHOOK_URL="https://www.poseidonsurge.surf/api/postsms"

# Optional: attach the new assistant to an existing Vapi phone number ID
# export VAPI_PHONE_NUMBER_ID="your-phone-number-id"

node vapi/scripts/provision.mjs
```

This creates `check_missing_person` and `report_missing_person`, injects `vapi/prompts/system-prompt.md` and `vapi/prompts/first-message.txt` into `vapi/assistant.json`, attaches both `toolIds`, and prints the created IDs.

## Manual Replication (Vapi Dashboard)

1. **Create two Custom Function Tools** in Vapi -> *Tools*:
   - Copy `vapi/tools/check_missing_person.json`
   - Copy `vapi/tools/report_missing_person.json`
   - Set **Server URL** on both to `https://<your-domain>/api/postsms`.
2. **Create Assistant** in Vapi -> *Assistants*:
   - **Name:** `HydroRescue Dispatch`
   - **First Message:** contents of `vapi/prompts/first-message.txt`
   - **Model:** OpenAI `gpt-4.1`
   - **System Prompt:** contents of `vapi/prompts/system-prompt.md`
   - **Voice:** ElevenLabs `cjVigY5qzO86Huf0OWal`
   - **Transcriber:** Soniox `stt-rt-v5`
   - **Tools:** attach both `check_missing_person` and `report_missing_person`.
3. **Link a Phone Number** in Vapi -> *Phone Numbers* -> select `HydroRescue Dispatch`.

## Backend Environment Variables

On the Next.js / Vercel server hosting `/api/postsms`:

- `DATABASE_URL` — Supabase Postgres transaction pooler URL (port `6543`).
- `DISABLE_REPORT_LIMIT=true` — *(optional, for live demos/testing)* disables the 10-reports-per-24h cap per phone number in `src/core/missing/service.ts`.
- `HELPLINE_REPORTS_FILE=/tmp/helpline-reports.json` — *(optional)* overrides the local JSON mirror path (`data/helpline-reports.json`); read-only filesystem errors on serverless are already caught safely in `src/core/helpline/vapi.ts`.

## Local & Production Smoke Test

```bash
# Test against local Next.js dev server
./vapi/scripts/test-webhook.sh http://localhost:3000/api/postsms

# Test against production
./vapi/scripts/test-webhook.sh https://www.poseidonsurge.surf/api/postsms
```
