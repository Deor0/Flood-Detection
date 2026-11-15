import type { AppDb } from '@/db/types';
import { smsLog } from '@/db/schema';
import { publicId } from '@/core/missing/names';
import {
  markFound,
  reportMissing,
  searchMissing,
  type MissingPerson,
} from '@/core/missing/service';
import { normalizeUsPhone } from '@/lib/phone';

export type InboundSms = { from: string; body: string; receivedAt: Date };
export type SmsResult = { reply: string; notifications: { to: string; body: string }[] };

const MAX_REPLY = 320;

export const HELP_TEXT =
  'Commands: SEARCH <name> | MISSING <name>, <place>, <age> | FOUND <name> | STATUS <place> | HELP';

/** Plain ASCII only (accents become their base letter, anything else "?"), at most 320 chars. */
export function toSmsText(text: string): string {
  const ascii = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
  return ascii.length <= MAX_REPLY ? ascii : `${ascii.slice(0, MAX_REPLY - 3)}...`;
}

/** Children are shown as initials only. */
function shownName(p: MissingPerson): string {
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

/** Status and region only: never contact, age, notes or the found note. */
function line(p: MissingPerson): string {
  const place = p.lastSeenLocation ? ` (${p.lastSeenLocation})` : '';
  return `${publicId(p.publicNumber)} ${shownName(p)}: ${p.status.toUpperCase()}${place}`;
}

type Parsed = { command: string; args: string };

function parse(body: string): Parsed {
  const trimmed = body.trim();
  const match = /^(\S+)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return { command: 'HELP', args: '' };
  const word = match[1].toUpperCase();
  const known = ['HELP', 'SEARCH', 'MISSING', 'FOUND', 'STATUS'];
  return known.includes(word)
    ? { command: word, args: match[2].trim() }
    : { command: 'UNKNOWN', args: trimmed };
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
  const [name = '', location = '', age = ''] = args.split(',').map((s) => s.trim());
  if (!name) return 'Send MISSING <name>, <place>, <age>. Place and age are optional.';
  const result = await reportMissing(
    db,
    { phone: from },
    { name, lastSeenLocation: location, age },
  );
  if (!result.ok) {
    if (result.rateLimited)
      return 'Report limit reached for today (10 per 24 hours). Please try again later.';
    const first = Object.values(result.fields)[0];
    return `Could not save the report: ${first ?? 'check the details'}`;
  }
  return `Report saved as ${publicId(result.person.publicNumber)} for ${shownName(result.person)} - send FOUND ${result.person.name} when they are found.`;
}

async function found(db: AppDb, from: string, args: string): Promise<string> {
  if (!args) return 'Send FOUND <name>, for example: FOUND Maya Rai';
  const rows = (await searchMissing(db, args, 10)).filter((p) => p.status === 'missing');
  if (rows.length === 0) return `No open record matches "${args}". Send SEARCH ${args} to check.`;
  const mine = rows.filter((p) => p.reporterPhone === from);
  if (mine.length === 0)
    return 'Only the phone that reported this person can mark them found by SMS. Ask a web admin to help.';
  if (mine.length > 1) return 'More than one of your reports matches. Send the full name.';
  const done = await markFound(db, { phone: from }, mine[0].id, 'Marked found by SMS');
  if (!done.ok) return 'That record is already marked found.';
  return `${publicId(done.person.publicNumber)} ${shownName(done.person)} is now marked FOUND. Thank you.`;
}

function status(args: string): string {
  if (!args) return 'Send STATUS <place>, for example: STATUS Kathmandu';
  return `SIMULATION ONLY: live river status for ${args} is on the web flood desk (Dashboard). It is an educational simulation, not an official forecast.`;
}

/**
 * Provider-agnostic entry point. Never sends anything: the caller (simulator page or a future
 * provider adapter) delivers `reply`. Every message is appended to sms_log; nothing is updated
 * or deleted there.
 */
export async function handleInboundSms(db: AppDb, sms: InboundSms): Promise<SmsResult> {
  const from = normalizeUsPhone(sms.from);
  const { command, args } = parse(sms.body);
  let reply: string;

  if (!from) {
    reply = 'Sorry, only US (+1) phone numbers are supported for now.';
    await log(db, sms, sms.from.trim().slice(0, 40), 'REFUSED', reply, args);
    return { reply: toSmsText(reply), notifications: [] };
  }

  try {
    switch (command) {
      case 'SEARCH':
        reply = await search(db, args);
        break;
      case 'MISSING':
        reply = await missing(db, from, args);
        break;
      case 'FOUND':
        reply = await found(db, from, args);
        break;
      case 'STATUS':
        reply = status(args);
        break;
      default:
        reply = HELP_TEXT;
    }
  } catch (err) {
    console.error('sms command failed', err);
    reply = 'Something went wrong. Please try again in a moment.';
  }

  reply = toSmsText(reply);
  await log(db, sms, from, command, reply, args);
  return { reply, notifications: [] };
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
