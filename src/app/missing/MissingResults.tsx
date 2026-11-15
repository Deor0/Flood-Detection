import { Check } from 'lucide-react';
import Link from 'next/link';
import { getDb } from '@/db';
import { suggestNames } from '@/core/missing/fuzzy';
import { lastFirst, publicId } from '@/core/missing/names';
import {
  PUBLIC_SEARCH_MIN_CHARS,
  publicSearch,
  type PublicPerson,
} from '@/core/missing/publicSearch';
import {
  isMinor,
  pendingFoundClaims,
  redactForViewer,
  searchMissing,
} from '@/core/missing/service';
import { canEditMissingDirectly, canSeeContact } from '@/core/permissions';
import { getViewer } from '@/lib/roles';
import styles from '@/components/page-ui.module.css';
import { timeAgo } from '@/lib/time';
import { SignInLink } from '@/components/SignInLink';
import { PersonActions } from './MissingForms';
import { StatusBadge } from './StatusBadge';
import local from './missing.module.css';

export type StatusFilter = 'missing' | 'found' | undefined;

const queryHref = (q: string, status: StatusFilter) => {
  const params = new URLSearchParams({ q });
  if (status) params.set('status', status);
  return `/missing?${params}`;
};

function StatusIcon({ found }: { found: boolean }) {
  return (
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
  );
}

/** "Did you mean …" links, shown only when the exact search found nobody. */
async function DidYouMean({
  q,
  status,
  includeMinors,
}: {
  q: string;
  status: StatusFilter;
  includeMinors: boolean;
}) {
  let names: string[] = [];
  try {
    names = await suggestNames(getDb(), q, { includeMinors });
  } catch (err) {
    console.error('name suggestions failed', err);
  }
  if (names.length === 0) return null;
  return (
    <p className={local.suggest}>
      Did you mean{' '}
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && (i === names.length - 1 ? ' or ' : ', ')}
          <Link href={queryHref(n, status)}>{n}</Link>
        </span>
      ))}
      ?
    </p>
  );
}

/**
 * Signed out: the same protections as /find. Nothing is listed without a name of at least
 * PUBLIC_SEARCH_MIN_CHARS letters, and only name (initials for children), ID, a coarse area and
 * status are sent: no age, notes, contact or found note.
 */
async function PublicResults({ q, status }: { q: string; status: StatusFilter }) {
  if (Array.from(q.replace(/\s/g, '')).length < PUBLIC_SEARCH_MIN_CHARS) {
    return (
      <div className={styles.empty}>
        Type at least {PUBLIC_SEARCH_MIN_CHARS} letters of a name to search the registry. To protect
        families, the full list and details are shown only to signed-in volunteers.
        <div className={styles.actions} style={{ justifyContent: 'center' }}>
          <SignInLink small to="see full records" />
        </div>
      </div>
    );
  }
  let people: PublicPerson[];
  try {
    people = (await publicSearch(getDb(), q)).filter((p) => !status || p.status === status);
  } catch (err) {
    console.error('public missing search failed', err);
    return (
      <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
        Could not load the registry. Try again in a moment.
      </p>
    );
  }
  return (
    <>
      <p className={styles.count}>
        Showing {people.length} {people.length === 1 ? 'match' : 'matches'} for “{q}”
      </p>
      {people.length === 0 ? (
        <div className={styles.empty}>
          No one matches that name.
          <DidYouMean q={q} status={status} includeMinors={false} />
        </div>
      ) : (
        <ul className={styles.list}>
          {people.map((p) => (
            <li key={p.publicId} className={styles.person}>
              <div className={styles.personTop}>
                <StatusIcon found={p.status === 'found'} />
                <div>
                  <h2 className={styles.personName}>
                    <Link href={`/missing/${p.publicId}`} className={local.nameLink}>
                      {p.name}
                    </Link>
                  </h2>
                  <p className={styles.personMeta}>
                    ID: #{p.publicId}
                    {p.region ? ` • Area: ${p.region}` : ''}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className={styles.actions}>
                <SignInLink
                  small
                  to={p.status === 'missing' ? 'report safe or suggest an edit' : 'suggest an edit'}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The result list. This is the only part of the page that waits on the database. */
export async function MissingResults({ q, status }: { q: string; status?: StatusFilter }) {
  const viewer = await getViewer();
  if (!viewer.userId) return <PublicResults q={q} status={status} />;

  const actor = { userId: viewer.userId, isAdmin: viewer.isAdmin };
  let people: (Awaited<ReturnType<typeof searchMissing>>[number] & {
    canEditDirectly: boolean;
    claimed: boolean;
    notesHidden: boolean;
  })[] = [];
  try {
    const rows = await searchMissing(getDb(), q, 50, { status });
    const claimed = await pendingFoundClaims(
      getDb(),
      rows.filter((p) => p.status === 'missing').map((p) => p.id),
    );
    // Contact is stripped here on the server, before anything reaches the client component.
    // Notes about a child are for the reporter and admins only.
    people = rows.map((p) => {
      const shown = redactForViewer(p, actor);
      const notesHidden = isMinor(p) && !canSeeContact(actor, p);
      return {
        ...shown,
        notes: notesHidden ? null : shown.notes,
        notesHidden,
        canEditDirectly: canEditMissingDirectly(actor, p),
        claimed: claimed.has(p.id),
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
          {q ? (
            <>
              No one matches that name.
              <DidYouMean q={q} status={status} includeMinors />
            </>
          ) : status ? (
            'No records with this status.'
          ) : (
            'No records yet. Use “Report a missing person” to add one.'
          )}
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
            const id = publicId(p.publicNumber);
            return (
              <li key={p.id} className={styles.person}>
                <div className={styles.personTop}>
                  <StatusIcon found={found} />
                  <div>
                    <h2 className={styles.personName}>
                      <Link href={`/missing/${id}`} className={local.nameLink}>
                        {lastFirst(p.name)}
                      </Link>
                    </h2>
                    <p className={styles.personMeta}>
                      {p.age !== null && <>Age: {p.age} • </>}ID: #{id}
                    </p>
                  </div>
                  <StatusBadge status={p.status} claimed={p.claimed} />
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
                  claimed={p.claimed}
                  notesHidden={p.notesHidden}
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
