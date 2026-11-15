import { clerkClient } from '@clerk/nextjs/server';
import { count, eq } from 'drizzle-orm';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import ui from '@/components/page-ui.module.css';
import { getDb, schema } from '@/db';
import {
  actorLabel,
  describeKind,
  listActivity,
  listOldestPending,
  listRecentActors,
  maskPhone,
  parseActivityFilter,
  SOURCE_LABEL,
  waitingLabel,
  type ActivityFilter,
} from '@/core/admin/activity';
import { adminPageGuard } from '@/lib/roles';
import { lookupUsers } from './programs/lookup';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

type Search = { kind?: string | string[]; actor?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Missing people' },
  { value: 'programs', label: 'Programs' },
  { value: 'alerts', label: 'Flood alerts' },
];

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await adminPageGuard();
  const sp = await searchParams;
  const kind = parseActivityFilter(one(sp.kind));
  const actor = (one(sp.actor) ?? '').slice(0, 100) || null;
  return (
    <main className={ui.page}>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Admin</h1>
          <p className={ui.lede}>Review pending work and audit recent activity.</p>
        </div>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Cards />
      </Suspense>
      <h2>Pending review — Penelope&rsquo;s Loom</h2>
      <p className={styles.counsel}>
        Athena&rsquo;s counsel: start with whatever has waited longest. Approving weaves a change
        in; rejecting unpicks it with a reason, and nothing is destroyed.
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <OldestPending />
      </Suspense>
      <h2>Activity — The Helmsman&rsquo;s Log</h2>
      <Suspense fallback={<ListSkeleton />}>
        <ActivityFilters kind={kind} actor={actor} />
      </Suspense>
      <Suspense key={`${kind}|${actor ?? ''}`} fallback={<ListSkeleton />}>
        <Activity kind={kind} actor={actor} />
      </Suspense>
    </main>
  );
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error('admin overview query failed', err);
    return null;
  }
}

async function Cards() {
  const db = getDb();
  const [programs, requests, users] = await Promise.all([
    safe(async () => {
      const [r] = await db
        .select({ n: count() })
        .from(schema.programs)
        .where(eq(schema.programs.status, 'pending'));
      return r?.n ?? 0;
    }),
    safe(async () => {
      const [r] = await db
        .select({ n: count() })
        .from(schema.missingPersonEditRequests)
        .where(eq(schema.missingPersonEditRequests.status, 'pending'));
      return r?.n ?? 0;
    }),
    safe(async () => (await clerkClient()).users.getCount()),
  ]);
  const show = (n: number | null) => (n === null ? 'Unavailable' : String(n));
  return (
    <div className={styles.cards}>
      <Link href="/admin/programs" className={styles.card}>
        <div className={styles.cardNum}>{show(programs)}</div>
        <div className={styles.cardLabel}>Pending programs</div>
      </Link>
      <Link href="/admin/missing" className={styles.card}>
        <div className={styles.cardNum}>{show(requests)}</div>
        <div className={styles.cardLabel}>Pending missing-person edit requests</div>
      </Link>
      <Link href="/admin/users" className={styles.card}>
        <div className={styles.cardNum}>{show(users)}</div>
        <div className={styles.cardLabel}>Registered users</div>
      </Link>
    </div>
  );
}

async function OldestPending() {
  const items = await safe(() => listOldestPending(getDb(), 8));
  if (items === null) return <p className={ui.empty}>The review queue is unavailable right now.</p>;
  if (items.length === 0) return <p className={ui.empty}>Nothing is waiting for review.</p>;
  const now = new Date();
  return (
    <ol className={styles.activity}>
      {items.map((i) => (
        <li key={`${i.source}-${i.id}`} className={styles.activityRow}>
          <Link href={i.href} className={styles.kind}>
            {i.title}
          </Link>
          <span className={styles.muted}>{waitingLabel(i.since, now)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Distinct actor label; phones are masked, ids resolved to a name or email. */
function actorOptionLabel(key: string, names: Map<string, string>) {
  return key.startsWith('+') ? `SMS ${maskPhone(key)}` : (names.get(key) ?? 'Unresolved account');
}

async function ActivityFilters({ kind, actor }: { kind: ActivityFilter; actor: string | null }) {
  const actors = (await safe(() => listRecentActors(getDb()))) ?? [];
  const names = await lookupUsers(actors.filter((a) => !a.startsWith('+')));
  return (
    <form method="get" className={styles.filters} aria-label="Filter activity">
      <label>
        <span>Kind</span>
        <select name="kind" defaultValue={kind} className={ui.input}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>By</span>
        <select name="actor" defaultValue={actor ?? ''} className={ui.input}>
          <option value="">Anyone</option>
          {actor && !actors.includes(actor) && (
            <option value={actor}>{actorOptionLabel(actor, names)}</option>
          )}
          {actors.map((a) => (
            <option key={a} value={a}>
              {actorOptionLabel(a, names)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={`${ui.button} ${ui.smallButton}`}>
        Filter
      </button>
      {(kind !== 'all' || actor) && (
        <Link href="/admin" className={styles.muted}>
          Clear
        </Link>
      )}
    </form>
  );
}

async function Activity({ kind, actor }: { kind: ActivityFilter; actor: string | null }) {
  const rows = await safe(() => listActivity(getDb(), { kind, actor, limit: 30 }));
  if (rows === null) return <p className={ui.empty}>Activity is unavailable right now.</p>;
  if (rows.length === 0) return <p className={ui.empty}>No activity matches.</p>;
  const names = await lookupUsers(
    rows.map((r) => r.actorUserId).filter((x): x is string => !!x && x !== 'unknown'),
  );
  return (
    <ul className={styles.activity}>
      {rows.map((r) => (
        <li key={r.id} className={styles.activityRow}>
          <span className={styles.kind}>
            {SOURCE_LABEL[r.source]}: {describeKind(r.kind)}
          </span>
          <span>{r.subject}</span>
          <span className={styles.muted}>by {actorLabel(r, names)}</span>
          {r.reason && <span className={styles.muted}>Reason: {r.reason}</span>}
          <time dateTime={r.at.toISOString()} className={styles.muted}>
            {r.at.toISOString().replace('T', ' ').slice(0, 16)} UTC
          </time>
        </li>
      ))}
    </ul>
  );
}
