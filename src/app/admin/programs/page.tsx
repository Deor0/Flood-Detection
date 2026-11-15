import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import { getDb } from '@/db';
import {
  listAllPrograms,
  listAttendees,
  listPendingPrograms,
  listRecentProgramEdits,
} from '@/core/programs/service';
import { CATEGORY_LABELS } from '@/core/programs/categories';
import { adminPageGuard } from '@/lib/roles';
import { CancelProgramButton, EditProgramForm } from '@/app/communities/ProgramForms';
import { STATUS_LABEL } from '@/app/communities/MyPrograms';
import pageStyles from '@/components/page-ui.module.css';
import mine from '@/app/communities/programs.module.css';
import styles from './admin-programs.module.css';
import { adminCancelProgramAction, adminEditProgramAction } from './actions';
import { ApproveButton, RejectForm } from './ReviewControls';
import { lookupUsers, whoIs } from './lookup';
import { appTimeZone } from '@/lib/time';
import { waitingLabel } from '@/core/admin/activity';

export const dynamic = 'force-dynamic';

const stamp = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: appTimeZone(),
});

export default async function AdminProgramsPage() {
  await adminPageGuard();
  return (
    <main className={pageStyles.page}>
      <div className={pageStyles.header}>
        <div>
          <h1 className={pageStyles.title}>Programs</h1>
          <p className={pageStyles.lede}>
            Review submissions, correct programs, and see who is attending.
          </p>
        </div>
      </div>

      <section className={mine.section} aria-labelledby="queue">
        <h2 id="queue" className={mine.heading}>
          Pending review — Penelope&rsquo;s Loom
        </h2>
        <p className={mine.meta}>
          Oldest first. Athena&rsquo;s counsel: approve to weave a program into the public list;
          reject to unpick it with a reason the host can read. Nothing is deleted.
        </p>
        <Suspense fallback={<ListSkeleton />}>
          <PendingQueue />
        </Suspense>
      </section>

      <section className={mine.section} aria-labelledby="all">
        <h2 id="all" className={mine.heading}>
          All programs
        </h2>
        <Suspense fallback={<ListSkeleton />}>
          <AllPrograms />
        </Suspense>
      </section>

      <section className={mine.section} aria-labelledby="edits">
        <h2 id="edits" className={mine.heading}>
          Recent host edits
        </h2>
        <Suspense fallback={<ListSkeleton />}>
          <RecentEdits />
        </Suspense>
      </section>
    </main>
  );
}

async function PendingQueue() {
  await adminPageGuard();
  const items = await listPendingPrograms(getDb());
  if (items.length === 0)
    return <div className={pageStyles.empty}>Nothing waiting for review.</div>;
  const names = await lookupUsers(items.map((p) => p.createdByUserId));
  const now = new Date();
  // Oldest pending first: the longest wait is reviewed first.
  const queue = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return (
    <ul className={mine.cardList}>
      {queue.map((p) => (
        <li key={p.id} className={mine.card}>
          <span className={`${mine.status} ${mine.pending}`}>{STATUS_LABEL.pending}</span>
          <h3 className={mine.cardTitle}>{p.title}</h3>
          <p className={mine.meta}>
            {CATEGORY_LABELS[p.category]} · organized by {p.organizer} · {p.location}
          </p>
          <p className={mine.meta}>
            {stamp.format(p.startsAt)} to {stamp.format(p.endsAt)} ({appTimeZone()}) ·{' '}
            {p.capacity === null ? 'open access' : `capacity ${p.capacity}`}
          </p>
          {p.topics && <p className={mine.meta}>Topics: {p.topics}</p>}
          <p className={mine.meta}>
            Submitted by {whoIs(names, p.createdByUserId)} on {stamp.format(p.createdAt)} UTC ·{' '}
            <strong>{waitingLabel(p.createdAt, now)}</strong>
          </p>
          <div className={mine.row}>
            <ApproveButton programId={p.id} />
          </div>
          <RejectForm programId={p.id} />
        </li>
      ))}
    </ul>
  );
}

async function AllPrograms() {
  const { userId } = await adminPageGuard();
  const db = getDb();
  const items = await listAllPrograms(db);
  if (items.length === 0) return <div className={pageStyles.empty}>No programs yet.</div>;
  const actor = { userId, isAdmin: true };
  const lists = await Promise.all(items.map((p) => listAttendees(db, actor, p.id)));
  const attendees = lists.map((l) => (l.ok ? l.attendees : []));
  const names = await lookupUsers([
    ...items.map((p) => p.createdByUserId),
    ...attendees.flatMap((a) => a.map((x) => x.userId)),
  ]);
  return (
    <ul className={mine.cardList}>
      {items.map((p, i) => (
        <li key={p.id} className={mine.card}>
          <span className={`${mine.status} ${mine[p.status]}`}>{STATUS_LABEL[p.status]}</span>
          <h3 className={mine.cardTitle}>{p.title}</h3>
          <p className={mine.meta}>
            {p.location} · host {whoIs(names, p.createdByUserId)} · {p.registered} registered
          </p>
          {p.status === 'rejected' && p.rejectionReason && (
            <p className={mine.reason}>Rejected: {p.rejectionReason}</p>
          )}
          <div className={mine.row}>
            <details className={mine.details}>
              <summary>Edit</summary>
              <EditProgramForm
                timeZone={appTimeZone()}
                save={adminEditProgramAction}
                program={{
                  id: p.id,
                  title: p.title,
                  category: p.category,
                  organizer: p.organizer,
                  location: p.location,
                  topics: p.topics,
                  startsAt: p.startsAt.toISOString(),
                  endsAt: p.endsAt.toISOString(),
                  capacity: p.capacity,
                }}
              />
            </details>
            <details className={mine.details}>
              <summary>Attendees ({attendees[i].length})</summary>
              {attendees[i].length === 0 ? (
                <p className={mine.meta}>No active registrations.</p>
              ) : (
                <ol className={styles.attendees}>
                  {attendees[i].map((a) => (
                    <li key={a.userId}>
                      {whoIs(names, a.userId)}{' '}
                      <span className={styles.muted}>
                        registered {stamp.format(a.registeredAt)} UTC
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </details>
            {p.status !== 'cancelled' && (
              <CancelProgramButton programId={p.id} cancel={adminCancelProgramAction} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? 'none' : String(v));

async function RecentEdits() {
  await adminPageGuard();
  const edits = await listRecentProgramEdits(getDb(), 20);
  if (edits.length === 0) return <div className={pageStyles.empty}>No edits yet.</div>;
  const names = await lookupUsers(edits.map((e) => e.actorUserId));
  return (
    <ul className={styles.feed}>
      {edits.map((e) => {
        const changes = (e.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
        return (
          <li key={e.id} className={styles.feedItem}>
            <strong>{e.title}</strong> edited by {whoIs(names, e.actorUserId)} on{' '}
            {stamp.format(e.createdAt)} UTC
            {Object.entries(changes).map(([field, c]) => (
              <p key={field} className={mine.diff}>
                {field}: <span className={styles.from}>{show(c.from)}</span> {'->'}{' '}
                <span className={styles.to}>{show(c.to)}</span>
              </p>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
