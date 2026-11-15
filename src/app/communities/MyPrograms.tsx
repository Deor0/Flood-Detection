import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import type { ProgramStatus } from '@/db/schema';
import { listMyPrograms } from '@/core/programs/service';
import { canManageProgram } from '@/core/permissions';
import { getViewer } from '@/lib/roles';
import { CancelProgramButton, EditProgramForm } from './ProgramForms';
import styles from './programs.module.css';
import { appTimeZone } from '@/lib/time';
import { placesLine } from './when';

export const STATUS_LABEL: Record<ProgramStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** "Your programs": everything the viewer submitted, with its status. Waits on Clerk and the DB. */
export async function MyPrograms() {
  const { userId } = await auth();
  if (!userId) return null;
  let items: Awaited<ReturnType<typeof listMyPrograms>> = [];
  try {
    items = await listMyPrograms(getDb(), userId);
  } catch (err) {
    console.error('my programs load failed', err);
    return (
      <p role="alert" className={styles.loadError}>
        Could not load your programs. Refresh the page to try again.
      </p>
    );
  }
  if (items.length === 0) return null;
  const viewer = await getViewer();
  const actor = { userId, isAdmin: viewer.isAdmin };

  return (
    <section className={styles.section} aria-labelledby="my-programs">
      <h2 id="my-programs" className={styles.heading}>
        Your programs
      </h2>
      <ul className={styles.cardList}>
        {items.map((p) => {
          const manage = canManageProgram(actor, p) && (p.status !== 'cancelled' || viewer.isAdmin);
          return (
            <li key={p.id} className={styles.card}>
              <span className={`${styles.status} ${styles[p.status]}`}>
                {STATUS_LABEL[p.status]}
              </span>
              <h3 className={styles.cardTitle}>{p.title}</h3>
              <p className={styles.meta}>
                {p.location} · {placesLine(p.registered, p.capacity)}
              </p>
              {p.status === 'approved' && manage && !viewer.isAdmin && (
                <p className={styles.meta}>
                  Changing the title, category, organizer, place or time sends it back for review.
                </p>
              )}
              {p.status === 'rejected' && p.rejectionReason && (
                <p className={styles.reason}>Reason: {p.rejectionReason}</p>
              )}
              {p.status === 'rejected' && manage && (
                <p className={styles.meta}>Editing and saving resubmits it for review.</p>
              )}
              {manage && (
                <div className={styles.row}>
                  <details className={styles.details}>
                    <summary>Edit</summary>
                    <EditProgramForm
                      timeZone={appTimeZone()}
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
                  {p.status !== 'cancelled' && <CancelProgramButton programId={p.id} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
