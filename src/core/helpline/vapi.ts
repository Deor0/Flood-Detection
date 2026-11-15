import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersons, smsLog } from '@/db/schema';
import { normalizeName, publicId } from '@/core/missing/names';
import { publicSearch } from '@/core/missing/publicSearch';
import { reportMissing, type MissingPerson } from '@/core/missing/service';

export type VapiToolCall = { id: string; name: string; arguments: unknown };

/** One saved report, with every missing_persons column. Missing details stay null. */
export type HelplineReport = {
  id: string;
  publicNumber: number;
  name: string;
  nameNormalized: string;
  age: number | null;
  lastSeenLocation: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  contact: string | null;
  status: 'missing' | 'found';
  reporterUserId: string | null;
  reporterPhone: string | null;
  foundByUserId: string | null;
  foundByPhone: string | null;
  foundNote: string | null;
  foundAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function helplineReportsFile(): string {
  const override = process.env.HELPLINE_REPORTS_FILE?.trim();
  return override || path.join(process.cwd(), 'data', 'helpline-reports.json');
}

/** Any valid phone number, in E.164. A blank or invalid value is null. */
export function normalizeCallerPhone(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  try {
    const parsed = parsePhoneNumberFromString(text);
    if (!parsed?.isValid()) return null;
    return parsed.number;
  } catch {
    return null;
  }
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The database row, in schema order, so the file can be read without a column list. */
export function toHelplineReport(person: MissingPerson): HelplineReport {
  return {
    id: person.id,
    publicNumber: person.publicNumber,
    name: person.name,
    nameNormalized: person.nameNormalized,
    age: person.age,
    lastSeenLocation: person.lastSeenLocation,
    lat: person.lat,
    lng: person.lng,
    notes: person.notes,
    contact: person.contact,
    status: person.status,
    reporterUserId: person.reporterUserId,
    reporterPhone: person.reporterPhone,
    foundByUserId: person.foundByUserId,
    foundByPhone: person.foundByPhone,
    foundNote: person.foundNote,
    foundAt: iso(person.foundAt),
    createdAt: iso(person.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(person.updatedAt) ?? new Date(0).toISOString(),
  };
}

/** A second report of the same name by the same caller (or call) within this window is a repeat. */
export const VOICE_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Best effort: the database row is the record. The JSON copy is skipped on Vercel (read-only file
 * system) and any other write failure is logged, never thrown, so the caller always hears the
 * saved report number and Vapi has no reason to retry.
 */
export async function appendReportBestEffort(record: HelplineReport): Promise<boolean> {
  if (process.env.VERCEL) return false;
  try {
    await appendReport(record);
    return true;
  } catch (err) {
    console.error('helpline-reports.json write skipped', err);
    return false;
  }
}

async function appendReport(record: HelplineReport): Promise<void> {
  const file = helplineReportsFile();
  await mkdir(path.dirname(file), { recursive: true });
  let list: HelplineReport[] = [];
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    if (Array.isArray(parsed)) list = parsed as HelplineReport[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  list.push(record);
  await writeFile(file, `${JSON.stringify(list, null, 2)}\n`);
}

function argsOf(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function handleVapiTools(input: {
  db: AppDb;
  callerPhone: string | null;
  /** Vapi's call id: tells repeats apart when the caller's number is hidden. */
  callId?: string | null;
  toolCalls: VapiToolCall[];
}): Promise<{ results: { toolCallId: string; result: string }[] }> {
  const results: { toolCallId: string; result: string }[] = [];
  const ctx = { callerPhone: input.callerPhone, callId: input.callId?.trim() || null };
  for (const call of input.toolCalls) {
    let result: unknown;
    try {
      result = await runTool(input.db, ctx, call);
    } catch (err) {
      console.error('vapi tool failed', err);
      result = { ok: false, error: 'server_error' };
    }
    results.push({ toolCallId: call.id, result: JSON.stringify(result) });
  }
  return { results };
}

type CallContext = { callerPhone: string | null; callId: string | null };

type Earlier = { publicNumber: number; name: string; status: 'missing' | 'found' };

/** The report this caller (or this call) already filed for the same name, minutes ago. */
async function earlierReport(db: AppDb, ctx: CallContext, name: string): Promise<Earlier | null> {
  const normalized = normalizeName(name);
  const since = new Date(Date.now() - VOICE_DUPLICATE_WINDOW_MS);
  if (ctx.callerPhone) {
    const [row] = await db
      .select({
        publicNumber: missingPersons.publicNumber,
        name: missingPersons.name,
        status: missingPersons.status,
      })
      .from(missingPersons)
      .where(
        and(
          eq(missingPersons.reporterPhone, ctx.callerPhone),
          eq(missingPersons.nameNormalized, normalized),
          gte(missingPersons.createdAt, since),
        ),
      )
      .orderBy(desc(missingPersons.createdAt))
      .limit(1);
    return row ?? null;
  }
  if (!ctx.callId) return null;
  const [logged] = await db
    .select({ parsed: smsLog.parsedJson })
    .from(smsLog)
    .where(
      and(
        eq(smsLog.command, VOICE_REPORT),
        eq(smsLog.fromPhone, callKey(ctx.callId)),
        sql`${smsLog.parsedJson}->>'nameNormalized' = ${normalized}`,
        gte(smsLog.receivedAt, since),
      ),
    )
    .orderBy(desc(smsLog.receivedAt))
    .limit(1);
  const number = Number((logged?.parsed as { publicNumber?: unknown } | undefined)?.publicNumber);
  if (!Number.isInteger(number)) return null;
  const [row] = await db
    .select({
      publicNumber: missingPersons.publicNumber,
      name: missingPersons.name,
      status: missingPersons.status,
    })
    .from(missingPersons)
    .where(eq(missingPersons.publicNumber, number))
    .limit(1);
  return row ?? null;
}

/** sms_log row kind for a voice report, so a hidden-number call can be matched by call id. */
export const VOICE_REPORT = 'VOICE_REPORT';
const callKey = (callId: string) => `vapi-call:${callId.slice(0, 80)}`;

async function logVoiceReport(
  db: AppDb,
  ctx: CallContext,
  person: { publicNumber: number; nameNormalized: string; name: string },
) {
  try {
    await db.insert(smsLog).values({
      fromPhone: ctx.callerPhone ?? (ctx.callId ? callKey(ctx.callId) : 'vapi-call:unknown'),
      rawBody: person.name.slice(0, 1000),
      command: VOICE_REPORT,
      parsedJson: {
        channel: 'voice',
        callId: ctx.callId,
        publicNumber: person.publicNumber,
        nameNormalized: person.nameNormalized,
      },
      reply: publicId(person.publicNumber),
      receivedAt: new Date(),
    });
  } catch (err) {
    console.error('voice report log failed', err);
  }
}

async function runTool(db: AppDb, ctx: CallContext, call: VapiToolCall) {
  const args = argsOf(call.arguments);
  if (call.name === 'check_missing_person') {
    const name = typeof args.name === 'string' ? args.name : '';
    const matches = (await publicSearch(db, name)).slice(0, 3);
    return { ok: true, matches };
  }
  if (call.name !== 'report_missing_person') return { ok: false, error: 'unknown_tool' };

  const name = typeof args.name === 'string' ? args.name : '';
  if (!name.trim())
    return { ok: false, error: 'invalid', fields: { name: 'Enter the full name.' } };

  // One caller's (or call's) reports run one at a time, so a retried tool call cannot slip past
  // the repeat check while the first one is still saving.
  const who = ctx.callerPhone ?? (ctx.callId ? callKey(ctx.callId) : null);
  const outcome = await db.transaction(async (tx) => {
    if (who)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'voice-report:' + who}))`);
    const earlier = await earlierReport(tx, ctx, name);
    if (earlier) return { kind: 'repeat', earlier } as const;
    const saved = await reportMissing(tx, ctx.callerPhone ? { phone: ctx.callerPhone } : {}, {
      name,
      age: (args.age as string | number | null | undefined) ?? null,
      lastSeenLocation: text(args.lastKnownLocation),
      notes: text(args.description),
      contact: null,
    });
    if (saved.ok) await logVoiceReport(tx, ctx, saved.person);
    return { kind: 'saved', saved } as const;
  });

  if (outcome.kind === 'repeat') {
    const { earlier } = outcome;
    return {
      ok: true,
      publicId: publicId(earlier.publicNumber),
      name: earlier.name,
      status: earlier.status,
      duplicate: true,
    };
  }
  const { saved } = outcome;
  if (!saved.ok) {
    if (saved.rateLimited) return { ok: false, error: 'rate_limited' };
    return { ok: false, error: 'invalid', fields: saved.fields };
  }

  // After the row is committed; never fails the tool call.
  await appendReportBestEffort(toHelplineReport(saved.person));
  return {
    ok: true,
    publicId: publicId(saved.person.publicNumber),
    name: saved.person.name,
    status: 'missing' as const,
  };
}
