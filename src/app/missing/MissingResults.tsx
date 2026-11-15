import { Check } from 'lucide-react';
import { getDb } from '@/db';
import { lastFirst, publicId } from '@/core/missing/names';
import { initials } from '@/core/missing/publicSearch';
import { redactForViewer, searchMissing } from '@/core/missing/service';
import { canEditMissingDirectly } from '@/core/permissions';
import { getViewer } from '@/lib/roles';
import styles from '@/components/page-ui.module.css';
import { timeAgo } from '@/lib/time';
import { SignInLink } from '@/components/SignInLink';
import { PersonActions } from './MissingForms';

/** The result list. This is the only part of the page that waits on the database. */
export async function MissingResults({ q }: { q: string }) {
  const viewer = await getViewer();
  const actor = { userId: viewer.userId ?? undefined, isAdmin: viewer.isAdmin };
  let people: (Awaited<ReturnType<typeof searchMissing>>[number] & { canEditDirectly: boolean })[] =
    [];
  try {
    // Contact is stripped here on the server, before anything reaches the client component.
    // Signed-out visitors also see anyone under 18 as initials only, as on the public /find page.
    people = (await searchMissing(getDb(), q)).map((p) => {
      const shown = redactForViewer(p, actor);
      const minor = p.age !== null && p.age < 18;
      return {
        ...shown,
        name: !viewer.userId && minor ? initials(p.name) : shown.name,
        canEditDirectly: canEditMissingDirectly(actor, p),
      };
    });
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
            : viewer.userId
              ? 'No records yet. Use “Report a missing person” to add one.'
              : 'No records yet.'}
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
                  <span
                    className={`${styles.statusIcon} ${found ? styles.statusFound : styles.statusMissing}`}
                    aria-hidden="true"
                  >
                    {found ? (
                      <Check size={20} strokeWidth={2.5} />
                    ) : (
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1 }}>?</span>
                    )}
                  </span>
                  <div>
                    <h2 className={styles.personName}>
                      {!viewer.userId && p.age !== null && p.age < 18 ? p.name : lastFirst(p.name)}
                    </h2>
                    <p className={styles.personMeta}>
                      {p.age !== null && <>Age: {p.age} • </>}ID: #{publicId(p.publicNumber)}
                    </p>
                  </div>
                  <span
                    className={`${styles.badge} ${found ? styles.badgeFound : styles.badgeMissing}`}
                  >
                    {found ? 'FOUND' : 'UNACCOUNTED / MISSING'}
                  </span>
                </div>
                <div className={styles.personBody}>
                  <span>
                    {detail.filter(Boolean).join(' • ')}
                    {p.notes ? ` • ${p.notes}` : ''}
                    {` • Updated ${timeAgo(p.updatedAt)}`}
                  </span>
                  {p.contact && <span className={styles.contactLine}>Contact: {p.contact}</span>}
                </div>
                {/* Signed out: no edit forms, so no record details are sent to the browser for them. */}
                {!viewer.userId ? (
                  <div className={styles.actions}>
                    <SignInLink
                      small
                      to={
                        p.status === 'missing' ? 'mark found or suggest an edit' : 'suggest an edit'
                      }
                    />
                  </div>
                ) : (
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
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
