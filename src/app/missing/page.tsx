import { CheckCircle2, CircleHelp, Search } from 'lucide-react';
import { getDb } from '@/db';
import { lastFirst, publicId } from '@/core/missing/names';
import { searchMissing } from '@/core/missing/service';
import styles from '@/components/page-ui.module.css';
import { timeAgo } from '@/lib/time';
import { PersonActions, ReportForm } from './MissingForms';

export const dynamic = 'force-dynamic';

export default async function MissingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : (params.q ?? '')).slice(0, 100);

  let people: Awaited<ReturnType<typeof searchMissing>> = [];
  let loadError = false;
  try {
    people = await searchMissing(getDb(), q);
  } catch (err) {
    console.error('missing page load failed', err);
    loadError = true;
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Missing Persons Registry</h1>
          <p className={styles.lede}>
            Search the registry, report someone who is missing, or mark a person as found. Records
            are kept permanently and every change is logged.
          </p>
        </div>
      </div>

      <form method="get" className={styles.search} role="search">
        <label className={styles.searchBox}>
          <Search size={18} aria-hidden="true" />
          <span style={{ position: 'absolute', left: '-9999px' }}>Search by name</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name…"
            className={styles.searchInput}
            maxLength={100}
          />
        </label>
        <button type="submit" className={styles.button}>
          Search
        </button>
      </form>

      <details className={styles.panel}>
        <summary>+ Report a missing person</summary>
        <ReportForm />
      </details>

      {loadError ? (
        <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
          Could not load the registry. Try again in a moment.
        </p>
      ) : (
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
                  ? [
                      p.foundNote ?? 'Found',
                      p.lastSeenLocation && `Last seen: ${p.lastSeenLocation}`,
                    ]
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
                      <span className={styles.badge}>
                        {found ? 'FOUND' : 'UNACCOUNTED / MISSING'}
                      </span>
                    </div>
                    <div className={styles.personBody}>
                      <span>
                        {detail.filter(Boolean).join(' • ')}
                        {p.notes ? ` • ${p.notes}` : ''}
                        {` • Updated ${timeAgo(p.updatedAt)}`}
                      </span>
                      {p.contact && (
                        <span className={styles.contactLine}>Contact: {p.contact}</span>
                      )}
                    </div>
                    <PersonActions
                      id={p.id}
                      status={p.status}
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
      )}
    </main>
  );
}
