import { Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { HelplineNote } from '@/components/HelplineNote';
import { ListSkeleton } from '@/components/ListSkeleton';
import { getDb } from '@/db';
import { PUBLIC_SEARCH_MIN_CHARS, publicSearch } from '@/core/missing/publicSearch';
import styles from '@/components/page-ui.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Find a person · Flood Response' };

async function Results({ q }: { q: string }) {
  if (Array.from(q.replace(/\s/g, '')).length < PUBLIC_SEARCH_MIN_CHARS) {
    return (
      <div className={styles.empty}>
        Type at least {PUBLIC_SEARCH_MIN_CHARS} letters of a name to search the registry.
      </div>
    );
  }
  let people;
  try {
    people = await publicSearch(getDb(), q);
  } catch (err) {
    console.error('public search failed', err);
    return (
      <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
        Could not search right now. Try again in a moment.
      </p>
    );
  }
  if (people.length === 0) return <div className={styles.empty}>No one matches that name.</div>;
  return (
    <>
      <p className={styles.count}>
        {people.length} {people.length === 1 ? 'match' : 'matches'} for “{q}”
      </p>
      <ul className={styles.list}>
        {people.map((p) => (
          <li key={p.publicId} className={styles.person}>
            <div className={styles.personTop}>
              <div>
                <h2 className={styles.personName}>{p.name}</h2>
                <p className={styles.personMeta}>
                  {p.publicId}
                  {p.region ? ` · ${p.region}` : ''}
                </p>
              </div>
              <span
                className={`${styles.badge} ${p.status === 'found' ? styles.badgeFound : styles.badgeMissing}`}
              >
                {p.status === 'found' ? 'FOUND' : 'MISSING'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.lede}>
        Only status and a general area are shown here.{' '}
        <Link href="/sign-in?redirect_url=/missing">Sign in</Link> for full details or to report
        someone.
      </p>
    </>
  );
}

export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : (params.q ?? '')).slice(0, 100);
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Find a person</h1>
          <p className={styles.lede}>
            Search the missing persons registry by name. You will see whether someone is listed as
            missing or found, and a general area only. Details of people under 18 are hidden.
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
      <Suspense key={q} fallback={<ListSkeleton />}>
        <Results q={q} />
      </Suspense>

      <HelplineNote heading="No internet? Search by phone call or text." />
    </main>
  );
}
