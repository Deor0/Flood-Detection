import { asc, desc, eq } from 'drizzle-orm';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { AppDb } from '@/db/types';
import {
  floodAlertEvents,
  floodAlerts,
  missingPersonEditRequests,
  missingPersonEvents,
  missingPersons,
  programEvents,
  programs,
} from '@/db/schema';

/**
 * Read-only queries for the admin overview: the activity feed ("The Helmsman's Log") and the
 * oldest pending work. Nothing here writes.
 */

export const ACTIVITY_KINDS = ['all', 'missing', 'programs', 'alerts'] as const;
export type ActivityFilter = (typeof ACTIVITY_KINDS)[number];
export type ActivitySource = 'missing' | 'program' | 'alert';

export type ActivityItem = {
  id: string;
  source: ActivitySource;
  /** The event kind as stored, e.g. "found", "approved", "verified". */
  kind: string;
  /** Who or what it is about: a person's name, a program title or an alert's place. */
  subject: string;
  actorUserId: string | null;
  actorPhone: string | null;
  reason: string | null;
  at: Date;
};

export const parseActivityFilter = (v: unknown): ActivityFilter =>
  (ACTIVITY_KINDS as readonly string[]).includes(v as string) ? (v as ActivityFilter) : 'all';

/** Phone actors are E.164 and start with "+"; anything else is a Clerk user id. */
const isPhone = (actor: string) => actor.startsWith('+');

/** Newest first, across missing-person, program and flood-alert events. */
export async function listActivity(
  db: AppDb,
  opts: { kind?: ActivityFilter; actor?: string | null; limit?: number } = {},
): Promise<ActivityItem[]> {
  const kind = opts.kind ?? 'all';
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);
  const actor = opts.actor?.trim() || null;
  const want = (s: ActivityFilter) => kind === 'all' || kind === s;
  // Program and alert events only ever have a Clerk user as actor, never a phone.
  const phoneActor = actor !== null && isPhone(actor);

  const [m, p, a] = await Promise.all([
    want('missing')
      ? db
          .select({
            id: missingPersonEvents.id,
            kind: missingPersonEvents.kind,
            subject: missingPersons.name,
            actorUserId: missingPersonEvents.actorUserId,
            actorPhone: missingPersonEvents.actorPhone,
            reason: missingPersonEvents.reason,
            at: missingPersonEvents.createdAt,
          })
          .from(missingPersonEvents)
          .innerJoin(missingPersons, eq(missingPersons.id, missingPersonEvents.missingPersonId))
          .where(
            actor
              ? isPhone(actor)
                ? eq(missingPersonEvents.actorPhone, actor)
                : eq(missingPersonEvents.actorUserId, actor)
              : undefined,
          )
          .orderBy(desc(missingPersonEvents.createdAt))
          .limit(limit)
      : [],
    want('programs') && !phoneActor
      ? db
          .select({
            id: programEvents.id,
            kind: programEvents.kind,
            subject: programs.title,
            actorUserId: programEvents.actorUserId,
            reason: programEvents.reason,
            at: programEvents.createdAt,
          })
          .from(programEvents)
          .innerJoin(programs, eq(programs.id, programEvents.programId))
          .where(actor ? eq(programEvents.actorUserId, actor) : undefined)
          .orderBy(desc(programEvents.createdAt))
          .limit(limit)
      : [],
    want('alerts') && !phoneActor
      ? db
          .select({
            id: floodAlertEvents.id,
            kind: floodAlertEvents.kind,
            subject: floodAlerts.place,
            alertKind: floodAlerts.kind,
            actorUserId: floodAlertEvents.actorUserId,
            at: floodAlertEvents.createdAt,
          })
          .from(floodAlertEvents)
          .innerJoin(floodAlerts, eq(floodAlerts.id, floodAlertEvents.alertId))
          .where(actor ? eq(floodAlertEvents.actorUserId, actor) : undefined)
          .orderBy(desc(floodAlertEvents.createdAt))
          .limit(limit)
      : [],
  ]);

  const items: ActivityItem[] = [
    ...m.map((e) => ({ ...e, id: `m-${e.id}`, source: 'missing' as const })),
    ...p.map((e) => ({ ...e, id: `p-${e.id}`, source: 'program' as const, actorPhone: null })),
    ...a.map(({ alertKind, ...e }) => ({
      ...e,
      id: `a-${e.id}`,
      source: 'alert' as const,
      subject: alertKind === 'simulated' ? `${e.subject} (simulated)` : e.subject,
      actorPhone: null,
      reason: null,
    })),
  ];
  // Newest first; ties broken by id so the order is stable between renders.
  items.sort((x, y) => y.at.getTime() - x.at.getTime() || (x.id < y.id ? -1 : 1));
  return items.slice(0, limit);
}

/** Distinct actors seen in recent events, most recent first, for the "by actor" filter. */
export async function listRecentActors(db: AppDb, limit = 200): Promise<string[]> {
  const recent = await listActivity(db, { limit });
  const seen = new Set<string>();
  for (const e of recent) {
    const key = e.actorUserId ?? e.actorPhone;
    if (key && key !== 'unknown') seen.add(key);
  }
  return [...seen];
}

/** "+1•••0132": country code and the last four digits only. */
export function maskPhone(phone: string): string {
  const parsed = parsePhoneNumberFromString(phone);
  const digits = phone.replace(/\D/g, '');
  const last = digits.slice(-4);
  const cc = parsed?.countryCallingCode;
  if (cc) return `+${cc}•••${last}`;
  return digits.length > 4 ? `•••${last}` : '•••';
}

/** A readable actor label: a name/email from `names`, a masked phone, or a neutral fallback. */
export function actorLabel(
  item: Pick<ActivityItem, 'actorUserId' | 'actorPhone'>,
  names: Map<string, string>,
): string {
  if (item.actorUserId && item.actorUserId !== 'unknown')
    return names.get(item.actorUserId) ?? 'an account that no longer resolves';
  if (item.actorPhone) return `SMS ${maskPhone(item.actorPhone)}`;
  return 'the system';
}

const VERBS: Record<string, string> = {
  reported: 'reported missing',
  edited: 'edited',
  found: 'marked found',
  reopened: 're-opened',
  edit_requested: 'edit suggested',
  edit_approved: 'edit approved (woven in)',
  edit_rejected: 'edit rejected (unpicked)',
  submitted: 'submitted for review',
  approved: 'approved (woven in)',
  rejected: 'rejected (unpicked)',
  cancelled: 'cancelled',
  detected: 'alert detected',
  verified: 'alert verified',
  notified: 'alert sent (simulated)',
  acknowledged: 'alert acknowledged',
};
export const SOURCE_LABEL: Record<ActivitySource, string> = {
  missing: 'Missing person',
  program: 'Program',
  alert: 'Flood alert',
};
export const describeKind = (kind: string) => VERBS[kind] ?? kind.replace(/_/g, ' ');

/** "waiting 3 h", "waiting 2 d", "waiting 12 min". */
export function waitingLabel(since: Date, now: Date = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
  if (min < 1) return 'waiting under a minute';
  if (min < 60) return `waiting ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `waiting ${h} h`;
  return `waiting ${Math.floor(h / 24)} d`;
}

export type PendingItem = {
  id: string;
  source: 'program' | 'edit_request';
  title: string;
  since: Date;
  href: string;
};

/** Pending programs and edit requests, oldest first (the longest wait is reviewed first). */
export async function listOldestPending(db: AppDb, limit = 8): Promise<PendingItem[]> {
  const [p, r] = await Promise.all([
    db
      .select({ id: programs.id, title: programs.title, since: programs.createdAt })
      .from(programs)
      .where(eq(programs.status, 'pending'))
      .orderBy(asc(programs.createdAt))
      .limit(limit),
    db
      .select({
        id: missingPersonEditRequests.id,
        title: missingPersons.name,
        since: missingPersonEditRequests.createdAt,
      })
      .from(missingPersonEditRequests)
      .innerJoin(missingPersons, eq(missingPersons.id, missingPersonEditRequests.missingPersonId))
      .where(eq(missingPersonEditRequests.status, 'pending'))
      .orderBy(asc(missingPersonEditRequests.createdAt))
      .limit(limit),
  ]);
  return [
    ...p.map((x) => ({
      ...x,
      source: 'program' as const,
      title: `Program: ${x.title}`,
      href: '/admin/programs',
    })),
    ...r.map((x) => ({
      ...x,
      source: 'edit_request' as const,
      title: `Suggested edit: ${x.title}`,
      href: '/admin/missing',
    })),
  ]
    .sort((x, y) => x.since.getTime() - y.since.getTime())
    .slice(0, limit);
}
