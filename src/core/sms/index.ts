import { and, desc, eq, gt, gte, isNotNull, lt, ne, or, isNull, sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersons, smsLog } from '@/db/schema';
import { publicId } from '@/core/missing/names';
import { coarseRegion } from '@/core/missing/publicSearch';
import {
  markFound,
  reportMissing,
  searchMissing,
  type MissingPerson,
} from '@/core/missing/service';
import { normalizeUsPhone } from '@/lib/phone';
import { normalizeBody, parseCommand, parseMissingArgs, readPublicId } from './parse';
import { statusReply } from './status';

export { parseCommand, parseMissingArgs } from './parse';
export { statusReply } from './status';

export type InboundSms = { from: string; body: string; receivedAt: Date };
export type SmsResult = { reply: string; notifications: { to: string; body: string }[] };

export const MAX_REPLY = 320;

/** A repeat of the same text from the same phone within this window gets the first reply again. */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
/** A phone's first text ever hears about reports of theirs found in this window. */
const FIRST_CONTACT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const HELP_TEXT =
  'Commands: SEARCH <name> | MISSING <name>, <place>, <age> | FOUND <name> | STATUS <place> | HELP';

/** Plain ASCII only (accents become their base letter, anything else "?"), at most 320 chars. */
export function toSmsText(text: string): string {
  const ascii = asciiText(text);
  return ascii.length <= MAX_REPLY ? ascii : `${ascii.slice(0, MAX_REPLY - 3)}...`;
}

function asciiText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Children are shown as initials only. */
function shownName(p: Pick<MissingPerson, 'name' | 'age'>): string {
  if (p.age !== null && p.age < 18) {
    return (
      p.name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `${w[0].toUpperCase()}.`)
        .join(' ') || 'Child'
    );
  }
  return p.name;
}

/** Status and a coarse region only: never contact, age, notes, the found note or the street. */
function line(p: MissingPerson): string {
  const region = coarseRegion(p.lastSeenLocation);
  const place = region ? ` (${region})` : '';
  return `${publicId(p.publicNumber)} ${shownName(p)}: ${p.status.toUpperCase()}${place}`;
}

async function search(db: AppDb, args: string): Promise<string> {
  if (!args) return 'Send SEARCH <name>, for example: SEARCH Maya Rai';
  const rows = await searchMissing(db, args, 4);
  if (rows.length === 0)
    return `No record found for "${args}". Send MISSING <name>, <place>, <age> to report.`;
  const shown = rows.slice(0, 3).map(line).join(' | ');
  return rows.length > 3 ? `${shown} | more matches: use a fuller name` : shown;
}

async function missing(db: AppDb, from: string, args: string): Promise<string> {
  const { name, place, age } = parseMissingArgs(args);
  if (!name) return 'Send MISSING <name>, <place>, <age>. Place and age are optional.';
  const result = await reportMissing(db, { phone: from }, { name, lastSeenLocation: place, age });
  if (!result.ok) {
    if (result.rateLimited)
      return 'Report limit reached for today (10 per 24 hours). Please try again later.';
    const first = Object.values(result.fields)[0];
    return `Could not save the report: ${first ?? 'check the details'}`;
  }
  return `Report saved as ${publicId(result.person.publicNumber)} for ${shownName(result.person)} - send FOUND ${result.person.name} when they are found.`;
}

async function markMine(db: AppDb, from: string, person: MissingPerson): Promise<string> {
  const done = await markFound(db, { phone: from }, person.id, 'Marked found by SMS');
  if (!done.ok) {
    if (done.reason === 'rate_limited')
      return 'Too many FOUND messages from this phone. Please try again in 10 minutes.';
    return 'That record is already marked found.';
  }
  return `${publicId(done.person.publicNumber)} ${shownName(done.person)} is now marked FOUND. Thank you.`;
}

async function found(db: AppDb, from: string, args: string): Promise<string> {
  if (!args) return 'Send FOUND <name>, for example: FOUND Maya Rai';
  const number = readPublicId(args);
  if (number !== null) {
    const [person] = await db
      .select()
      .from(missingPersons)
      .where(eq(missingPersons.publicNumber, number))
      .limit(1);
    if (!person) return `No record ${publicId(number)}. Send SEARCH <name> to check.`;
    if (person.status === 'found') return 'That record is already marked found.';
    if (person.reporterPhone !== from)
      return 'Only the phone that reported this person can mark them found by SMS. Ask a web admin to help.';
    return markMine(db, from, person);
  }
  const rows = (await searchMissing(db, args, 10)).filter((p) => p.status === 'missing');
  if (rows.length === 0) return `No open record matches "${args}". Send SEARCH ${args} to check.`;
  const mine = rows.filter((p) => p.reporterPhone === from);
  if (mine.length === 0)
    return 'Only the phone that reported this person can mark them found by SMS. Ask a web admin to help.';
  if (mine.length > 1)
    return `More than one of your reports matches: ${mine
      .slice(0, 3)
      .map((p) => publicId(p.publicNumber))
      .join(', ')}. Send FOUND REG-xxxxx.`;
  return markMine(db, from, mine[0]);
}

/**
 * Reports this phone filed that someone else marked found since the phone last texted in
 * (or in the last 30 days, for a first text), as "Good news" lines.
 */
async function reunionNotice(db: AppDb, from: string, now: Date): Promise<string> {
  const [previous] = await db
    .select({ at: smsLog.receivedAt })
    .from(smsLog)
    .where(and(eq(smsLog.fromPhone, from), lt(smsLog.receivedAt, now)))
    .orderBy(desc(smsLog.receivedAt))
    .limit(1);
  const since = previous?.at ?? new Date(now.getTime() - FIRST_CONTACT_WINDOW_MS);
  const rows = await db
    .select()
    .from(missingPersons)
    .where(
      and(
        eq(missingPersons.reporterPhone, from),
        eq(missingPersons.status, 'found'),
        isNotNull(missingPersons.foundAt),
        gt(missingPersons.foundAt, since),
        or(isNull(missingPersons.foundByPhone), ne(missingPersons.foundByPhone, from)),
      ),
    )
    .orderBy(desc(missingPersons.foundAt))
    .limit(5);
  if (rows.length === 0) return '';
  const named = rows
    .slice(0, 2)
    .map((p) => `${publicId(p.publicNumber)} ${shownName(p)}`)
    .join(' and ');
  const more = rows.length > 2 ? ` (+${rows.length - 2} more)` : '';
  return `Good news: ${named}${more} ${rows.length === 1 ? 'is' : 'are'} home safe.`;
}

/** Notice first; if both do not fit in one text, the notice is shortened, then the reply cut. */
function withNotice(notice: string, reply: string): string {
  if (!notice) return reply;
  const full = `${notice} ${reply}`;
  const n = (notice.match(/REG-\d+/g) ?? []).length;
  if (asciiText(full).length <= MAX_REPLY || n <= 1) return full;
  return `Good news: ${notice.includes('more') ? 'several' : n} of your reports are home safe. ${reply}`;
}

/** The previous reply when this exact text came from this phone moments ago (a double send). */
async function duplicateReply(db: AppDb, from: string, sms: InboundSms): Promise<string | null> {
  const [last] = await db
    .select()
    .from(smsLog)
    .where(
      and(
        eq(smsLog.fromPhone, from),
        gte(smsLog.receivedAt, new Date(sms.receivedAt.getTime() - DUPLICATE_WINDOW_MS)),
      ),
    )
    .orderBy(desc(smsLog.receivedAt))
    .limit(1);
  if (!last || normalizeBody(last.rawBody) !== normalizeBody(sms.body)) return null;
  return last.reply;
}

/**
 * Provider-agnostic entry point. Never sends anything: the caller (simulator page, the iOS
 * Shortcut route) delivers `reply`. Every message is appended to sms_log; nothing is updated
 * or deleted there. One phone's texts are handled one at a time (an advisory lock), so a
 * Shortcut that fires twice files one report, not two.
 */
export async function handleInboundSms(db: AppDb, sms: InboundSms): Promise<SmsResult> {
  const from = normalizeUsPhone(sms.from);
  const { command, args } = parseCommand(sms.body);

  if (!from) {
    const reply = 'Sorry, only US (+1) phone numbers are supported for now.';
    await log(db, sms, sms.from.trim().slice(0, 40), 'REFUSED', reply, args);
    return { reply: toSmsText(reply), notifications: [] };
  }

  try {
    const reply = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'sms-in:' + from}))`);

      // Only commands that change the registry are de-duplicated; a repeated SEARCH runs again.
      if (command === 'MISSING' || command === 'FOUND') {
        const again = await duplicateReply(tx, from, sms);
        if (again !== null) {
          await log(tx, sms, from, 'DUPLICATE', again, args);
          return again;
        }
      }

      let text: string;
      try {
        // A savepoint: a failing command must not lose the log entry below.
        text = await tx.transaction(async (sp) => {
          const notice = await reunionNotice(sp, from, sms.receivedAt);
          return withNotice(notice, await run(sp, command, from, args));
        });
      } catch (err) {
        console.error('sms command failed', err);
        text = 'Something went wrong. Please try again in a moment.';
      }
      text = toSmsText(text);
      await log(tx, sms, from, command, text, args);
      return text;
    });
    return { reply, notifications: [] };
  } catch (err) {
    console.error('sms handling failed', err);
    const reply = toSmsText('Something went wrong. Please try again in a moment.');
    await log(db, sms, from, command, reply, args);
    return { reply, notifications: [] };
  }
}

async function run(db: AppDb, command: string, from: string, args: string): Promise<string> {
  switch (command) {
    case 'SEARCH':
      return search(db, args);
    case 'MISSING':
      return missing(db, from, args);
    case 'FOUND':
      return found(db, from, args);
    case 'STATUS':
      return statusReply(args);
    default:
      return HELP_TEXT;
  }
}

async function log(
  db: AppDb,
  sms: InboundSms,
  from: string,
  command: string,
  reply: string,
  args: string,
) {
  try {
    await db.insert(smsLog).values({
      fromPhone: from,
      rawBody: sms.body.slice(0, 1000),
      command,
      parsedJson: { args: args.slice(0, 500) },
      reply,
      receivedAt: sms.receivedAt,
    });
  } catch (err) {
    console.error('sms_log insert failed', err);
  }
}
