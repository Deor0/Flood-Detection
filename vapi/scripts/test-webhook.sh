#!/usr/bin/env bash
set -euo pipefail

WEBHOOK_URL="${1:-http://localhost:3000/api/postsms}"

echo "==> 1. Testing status-update (non-tool-calls event)"
curl -sS -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"message":{"type":"status-update","status":"in-progress"}}'
echo ""

echo "==> 2. Testing check_missing_person (Maya Rai)"
curl -sS -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [
        {
          "id": "smoke-check-1",
          "name": "check_missing_person",
          "arguments": { "name": "Maya Rai" }
        }
      ]
    }
  }'
echo ""

if [[ "${RUN_WRITE_TEST:-false}" == "true" ]]; then
  echo "==> 3. Testing report_missing_person (writes to DB!)"
  curl -sS -X POST "$WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d '{
      "message": {
        "type": "tool-calls",
        "toolCallList": [
          {
            "id": "smoke-report-1",
            "name": "report_missing_person",
            "arguments": {
              "name": "Test Caller",
              "age": 30,
              "lastKnownLocation": "Dhunche, Rasuwa",
              "description": "Blue jacket"
            }
          }
        ],
        "call": { "customer": { "number": "+14155550199" } }
      }
    }'
  echo ""
else
  echo "==> 3. Skipping report_missing_person write test (set RUN_WRITE_TEST=true to run)"
fi
