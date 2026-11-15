#!/usr/bin/env node
/**
 * Provision a fresh replica of the HydroRescue Dispatch Vapi assistant and its tools.
 *
 * Required:
 *   VAPI_API_KEY=...
 *
 * Optional:
 *   VAPI_WEBHOOK_URL=https://www.poseidonsurge.surf/api/postsms
 *   VAPI_PHONE_NUMBER_ID=<existing-vapi-phone-number-id>
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VAPI_BASE_URL = 'https://api.vapi.ai';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const apiKey = process.env.VAPI_API_KEY?.trim();
if (!apiKey) {
  console.error('Error: VAPI_API_KEY environment variable is required.');
  process.exit(1);
}

const webhookUrl =
  process.env.VAPI_WEBHOOK_URL?.trim() || 'https://www.poseidonsurge.surf/api/postsms';

async function vapiRequest(method, endpoint, body) {
  const res = await fetch(`${VAPI_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function loadJson(relPath) {
  return JSON.parse(await readFile(path.join(ROOT, relPath), 'utf8'));
}

async function main() {
  const [systemPrompt, firstMessage, checkToolDef, reportToolDef, assistantDef] =
    await Promise.all([
      readFile(path.join(ROOT, 'prompts/system-prompt.md'), 'utf8'),
      readFile(path.join(ROOT, 'prompts/first-message.txt'), 'utf8'),
      loadJson('tools/check_missing_person.json'),
      loadJson('tools/report_missing_person.json'),
      loadJson('assistant.json'),
    ]);

  checkToolDef.server.url = webhookUrl;
  reportToolDef.server.url = webhookUrl;

  console.log(`Creating Vapi tools pointing to ${webhookUrl}...`);
  const checkTool = await vapiRequest('POST', '/tool', checkToolDef);
  const reportTool = await vapiRequest('POST', '/tool', reportToolDef);
  console.log(`  check_missing_person:  ${checkTool.id}`);
  console.log(`  report_missing_person: ${reportTool.id}`);

  assistantDef.firstMessage = firstMessage.trim();
  assistantDef.model.messages = [{ role: 'system', content: systemPrompt.trim() }];
  assistantDef.model.toolIds = [checkTool.id, reportTool.id];

  console.log(`Creating Vapi assistant "${assistantDef.name}"...`);
  const assistant = await vapiRequest('POST', '/assistant', assistantDef);
  console.log(`  assistant:             ${assistant.id}`);

  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID?.trim();
  if (phoneNumberId) {
    console.log(`Linking phone number ${phoneNumberId} -> ${assistant.id}...`);
    await vapiRequest('PATCH', `/phone-number/${phoneNumberId}`, {
      assistantId: assistant.id,
    });
    console.log('  phone number linked.');
  }

  console.log('\nDone! Your Vapi voice agent is ready.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
