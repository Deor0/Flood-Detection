import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { lastFirst, parsePublicId, publicId } from '@/core/missing/names';
import { coarseRegion, initials } from '@/core/missing/publicSearch';
import { isMinor, pendingFoundClaims, redactForViewer } from '@/core/missing/service';
import { getMissingByPublicNumber, publicTimeline } from '@/core/missing/timeline';
import { canEditMissingDirectly, canSeeContact } from '@/core/permissions';
import { getViewer } from '@/lib/roles';
import { timeAgo } from '@/lib/time';
import styles from '@/components/page-ui.module.css';
import { SignInLink } from '@/components/SignInLink';
import { PersonActions } from '../MissingForms';
import { StatusBadge } from '../StatusBadge';
import local from '../missing.module.css';

export const dynamic = 'force-dynamic';

/** Tab title from the public id only, so no name ends up in browser history or link previews. */
export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId: raw } = await params;
  const n = parsePublicId(decodeURIComponent(raw));
  return { title: `${n ? publicId(n) : 'Record'} · The Long Way Home · Poseidon Surge` };
}

/**
 * One record and its history. Signed out, it shows what /find shows (initials for children, a
 * coarse area, status) plus a timeline of what happened and when, never who did it or why.
 */
export default async function MissingRecordPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId: raw } = await params;
  const number = parsePublicId(decodeURIComponent(raw));
  if (!number) notFound();

  const db = getDb();
  const [row, viewer] = await Promise.all([getMissingByPublicNumber(db, number), getViewer()]);
  if (!row) notFound();
  const [timeline, claims] = await Promise.all([
    publicTimeline(db, row.id),
    pendingFoundClaims(db, row.status === 'missing' ? [row.id] : []),
  ]);
  const claimed = claims.has(row.id);
  const id = publicId(row.publicNumber);
  const signedIn = !!viewer.userId;
  const actor = { userId: viewer.userId ?? undefined, isAdmin: viewer.isAdmin };
  const shown = redactForViewer(row, actor);
  const notesHidden = isMinor(row) && !canSeeContact(actor, row);

  return (
    <main className={styles.page}>
      <p className={styles.count}>
        <Link href="/missing">← Missing Persons Registry</Link>
      </p>
      <div className={styles.person}>
        <div className={styles.personTop}>
          <div>
            <p className={local.kicker}>The Long Way Home</p>
            <h1 className={styles.title}>
              {signedIn ? lastFirst(row.name) : isMinor(row) ? initials(row.name) : row.name}
            </h1>
            <p className={styles.personMeta}>
              {signedIn && row.age !== null && <>Age: {row.age} • </>}ID: #{id}
              {!signedIn && coarseRegion(row.lastSeenLocation)
                ? ` • Area: ${coarseRegion(row.lastSeenLocation)}`
                : ''}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>
        {signedIn && (
          <div className={styles.personBody}>
            <span>
              {row.status === 'found' ? `${shown.foundNote ?? 'Found'} • ` : ''}
              {row.lastSeenLocation
                ? `Last reported at ${row.lastSeenLocation}`
                : 'Last location unknown'}
              {!notesHidden && row.notes ? ` • ${row.notes}` : ''}
              {` • Updated ${timeAgo(row.updatedAt)}`}
            </span>
            {shown.contact && <span className={styles.contactLine}>Contact: {shown.contact}</span>}
          </div>
        )}
        {signedIn ? (
          <PersonActions
            id={row.id}
            status={row.status}
            canEditDirectly={canEditMissingDirectly(actor, row)}
            isAdmin={viewer.isAdmin}
            claimed={claimed}
            notesHidden={notesHidden}
            values={{
              name: row.name,
              age: row.age,
              lastSeenLocation: row.lastSeenLocation,
              notes: notesHidden ? null : row.notes,
              contact: shown.contact,
            }}
          />
        ) : (
          <div className={styles.actions}>
            <SignInLink small to="see full details or report this person safe" />
          </div>
        )}
      </div>

      <section style={{ marginTop: '2rem' }} aria-labelledby="history">
        <p className={local.kicker}>Penelope&rsquo;s loom · every thread kept, none unpicked</p>
        <h2 id="history" className={styles.personName} style={{ marginBottom: '1rem' }}>
          Record history
        </h2>
        {timeline.length === 0 ? (
          <div className={styles.empty}>No history recorded yet.</div>
        ) : (
          <ol className={local.timeline}>
            {timeline.map((t, i) => (
              <li key={i}>
                <strong>{t.label}</strong>
                {t.channel === 'text' ? ' (by text message)' : ''}
                <time className={local.when} dateTime={t.at.toISOString()}>
                  {t.at.toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'UTC',
                  })}{' '}
                  UTC · {timeAgo(t.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
