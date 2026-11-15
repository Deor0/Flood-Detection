import { Search } from 'lucide-react';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import styles from '@/components/page-ui.module.css';
import { adminPageGuard } from '@/lib/roles';
import { EditRequestQueue, RecordsWithHistory } from './AdminMissingSections';
import local from './admin-missing.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminMissingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await adminPageGuard();
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : (params.q ?? '')).slice(0, 100);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Missing persons: review</h1>
          <p className={styles.lede}>
            Review suggested edits, correct records and see the full history of every change.
          </p>
        </div>
      </div>

      <section className={local.section} aria-labelledby="queue-title">
        <h2 id="queue-title" className={local.sectionTitle}>
          Suggested edits waiting for review
        </h2>
        <Suspense fallback={<ListSkeleton />}>
          <EditRequestQueue />
        </Suspense>
      </section>

      <section className={local.section} aria-labelledby="records-title">
        <h2 id="records-title" className={local.sectionTitle}>
          Records and history
        </h2>
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
          <RecordsWithHistory q={q} />
        </Suspense>
      </section>
    </main>
  );
}
