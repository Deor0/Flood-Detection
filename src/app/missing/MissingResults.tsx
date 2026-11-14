import { CheckCircle2, CircleHelp } from 'lucide-react';
import { getDb } from '@/db';
import { lastFirst, publicId } from '@/core/missing/names';
import { redactForViewer, searchMissing } from '@/core/missing/service';
import { canEditMissingDirectly } from '@/core/permissions';
import { getViewer } from '@/lib/roles';
import styles from '@/components/page-ui.module.css';
import { timeAgo } from '@/lib/time';
import { PersonActions } from './MissingForms';

/** The result list. This is the only part of the page that waits on the database. */
export async function MissingResults({ q }: { q: string }) {
  const viewer = await getViewer();
  const actor = { userId: viewer.userId ?? undefined, isAdmin: viewer.isAdmin };
  let people: (Awaited<ReturnType<typeof searchMissing>>[number] & { canEditDirectly: boolean })[] =
    [];
  try {
    // Contact is stripped here on the server, before anything reaches the client component.
    people = (await searchMissing(getDb(), q)).map((p) => ({
      ...redactForViewer(p, actor),
      canEditDirectly: canEditMissingDirectly(actor, p),
    }));
  } catch (err) {
    console.error('missing page load failed', err);
    return (
      <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
        Could not load the registry. Try again in a moment.
      </p>
    );
  }

  return (
    <>
      <p className={styles.count}>
        {q
          ? `Showing ${people.length} ${people.length === 1 ? 'match' : 'matches'} for “${q}”`
          : `Showing ${people.length} ${people.length === 1 ? 'record' : 'records'}`}
      </p>
      {people.length === 0 ? (
        <div className={styles.empty}>
          {q
            ? 'No one matches that name.'
            : 'No records yet. Use “Report a missing person” to add one.'}
        </div>
      ) : (
        <ul className={styles.list}>
          {people.map((p) => {
            const found = p.status === 'found';
            const detail = found
              ? [p.foundNote ?? 'Found', p.lastSeenLocation && `Last seen: ${p.lastSeenLocation}`]
              : [
                  p.lastSeenLocation
                    ? `Last reported at ${p.lastSeenLocation}`
                    : 'Last location unknown',
                ];
            return (
              <li key={p.id} className={styles.person}>
                <div className={styles.personTop}>
                  <span className={styles.statusIcon} aria-hidden="true">
                    {found ? <CheckCircle2 size={20} /> : <CircleHelp size={20} />}
                  </span>
                  <div>
                    <h2 className={styles.personName}>{lastFirst(p.name)}</h2>
                    <p className={styles.personMeta}>
                      {p.age !== null && <>Age: {p.age} • </>}ID: #{publicId(p.publicNumber)}
                    </p>
                  </div>
                  <span className={styles.badge}>{found ? 'FOUND' : 'UNACCOUNTED / MISSING'}</span>
                </div>
                <div className={styles.personBody}>
                  <span>
                    {detail.filter(Boolean).join(' • ')}
                    {p.notes ? ` • ${p.notes}` : ''}
                    {` • Updated ${timeAgo(p.updatedAt)}`}
                  </span>
                  {p.contact && <span className={styles.contactLine}>Contact: {p.contact}</span>}
                </div>
                <PersonActions
                  id={p.id}
                  status={p.status}
                  canEditDirectly={p.canEditDirectly}
                  isAdmin={viewer.isAdmin}
                  values={{
                    name: p.name,
                    age: p.age,
                    lastSeenLocation: p.lastSeenLocation,
                    notes: p.notes,
                    contact: p.contact,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
