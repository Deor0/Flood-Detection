import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { AppDb } from '@/db/types';
import { publicId } from '@/core/missing/names';
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
  toolCalls: VapiToolCall[];
}): Promise<{ results: { toolCallId: string; result: string }[] }> {
  const results: { toolCallId: string; result: string }[] = [];
  for (const call of input.toolCalls) {
    results.push({
      toolCallId: call.id,
      result: JSON.stringify(await runTool(input.db, input.callerPhone, call)),
    });
  }
  return { results };
}

async function runTool(db: AppDb, callerPhone: string | null, call: VapiToolCall) {
  const args = argsOf(call.arguments);
  if (call.name === 'check_missing_person') {
    const name = typeof args.name === 'string' ? args.name : '';
    const matches = (await publicSearch(db, name)).slice(0, 3);
    return { ok: true, matches };
  }
  if (call.name !== 'report_missing_person') return { ok: false, error: 'unknown_tool' };

  const name = typeof args.name === 'string' ? args.name : '';
  if (!name.trim()) return { ok: false, error: 'invalid', fields: { name: 'Enter the full name.' } };

  const saved = await reportMissing(db, callerPhone ? { phone: callerPhone } : {}, {
    name,
    age: (args.age as string | number | null | undefined) ?? null,
    lastSeenLocation: text(args.lastKnownLocation),
    notes: text(args.description),
    contact: null,
  });
  if (!saved.ok) {
    if (saved.rateLimited) return { ok: false, error: 'rate_limited' };
    return { ok: false, error: 'invalid', fields: saved.fields };
  }

  const record = toHelplineReport(saved.person);
  // The database row is the record. The JSON copy is a local convenience: on Vercel the disk is
  // read-only, so a failed copy must not turn a saved report into a 500 for the caller.
  try {
    await appendReport(record);
  } catch (err) {
    console.error('helpline file copy skipped:', (err as Error).message);
  }
  return {
    ok: true,
    publicId: publicId(saved.person.publicNumber),
    name: saved.person.name,
    status: 'missing' as const,
  };
}
