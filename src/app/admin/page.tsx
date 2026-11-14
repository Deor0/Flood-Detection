import { clerkClient } from '@clerk/nextjs/server';
import { count, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import ui from '@/components/page-ui.module.css';
import { getDb, schema } from '@/db';
import { adminPageGuard } from '@/lib/roles';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  await adminPageGuard();
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
      <h2>Recent activity</h2>
      <Suspense fallback={<ListSkeleton />}>
        <Activity />
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

async function Activity() {
  const db = getDb();
  const rows = await safe(async () => {
    const [p, m] = await Promise.all([
      db
        .select()
        .from(schema.programEvents)
        .orderBy(desc(schema.programEvents.createdAt))
        .limit(10),
      db
        .select()
        .from(schema.missingPersonEvents)
        .orderBy(desc(schema.missingPersonEvents.createdAt))
        .limit(10),
    ]);
    return [
      ...p.map((e) => ({
        id: `p-${e.id}`,
        source: 'Program',
        kind: e.kind,
        actor: e.actorUserId,
        at: e.createdAt,
      })),
      ...m.map((e) => ({
        id: `m-${e.id}`,
        source: 'Missing person',
        kind: e.kind,
        actor: e.actorUserId ?? e.actorPhone ?? 'unknown',
        at: e.createdAt,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 15);
  });
  if (rows === null) return <p className={ui.empty}>Activity is unavailable right now.</p>;
  if (rows.length === 0) return <p className={ui.empty}>No activity yet.</p>;
  return (
    <ul className={styles.activity}>
      {rows.map((r) => (
        <li key={r.id} className={styles.activityRow}>
          <span className={styles.kind}>
            {r.source}: {r.kind}
          </span>
          <span className={styles.muted}>by {r.actor}</span>
          <time dateTime={r.at.toISOString()} className={styles.muted}>
            {r.at.toISOString().replace('T', ' ').slice(0, 16)} UTC
          </time>
        </li>
      ))}
    </ul>
  );
}
