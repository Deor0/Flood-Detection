import { Show } from '@clerk/nextjs';
import { Search } from 'lucide-react';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import { SignInLink } from '@/components/SignInLink';
import styles from '@/components/page-ui.module.css';
import { MissingResults } from './MissingResults';
import { ReportForm } from './MissingForms';

export const dynamic = 'force-dynamic';

export default async function MissingPage({
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

      {/* Signed-out visitors can read the registry; filing a report needs an account. */}
      <Suspense fallback={null}>
        <Show
          when="signed-in"
          fallback={
            <div className={styles.actions}>
              <SignInLink to="report a missing person" />
            </div>
          }
        >
          <details className={styles.panel}>
            <summary>+ Report a missing person</summary>
            <ReportForm />
          </details>
        </Show>
      </Suspense>

      {/* Header, search and the report form paint at once; only this list waits on the database. */}
      <Suspense key={q} fallback={<ListSkeleton />}>
        <MissingResults q={q} />
      </Suspense>
    </main>
  );
}
