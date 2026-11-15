import Link from 'next/link';
import { Search } from 'lucide-react';
import { Suspense } from 'react';
import { PROGRAM_CATEGORIES } from '@/db/schema';
import { CATEGORY_LABELS } from '@/core/programs/categories';
import { ListSkeleton } from '@/components/ListSkeleton';
import styles from '@/components/page-ui.module.css';
import { ProgramResults } from './ProgramResults';
import { appTimeZone } from '@/lib/time';
import { HostForm } from './ProgramForms';
import { MyPrograms } from './MyPrograms';

export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = first(params.q).slice(0, 100);
  const category = PROGRAM_CATEGORIES.find((c) => c === first(params.category));

  const href = (cat?: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (cat) sp.set('category', cat);
    const s = sp.toString();
    return s ? `/communities?${s}` : '/communities';
  };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Community Awareness Programs</h1>
          <p className={styles.lede}>
            Disaster preparedness drills, first-aid workshops, flood safety sessions, and emergency
            volunteer briefings reviewed by our team.
          </p>
        </div>
      </div>

      <details className={styles.panel}>
        <summary>+ Host / Register Program</summary>
        <p className={styles.lede}>
          New programs are submitted for review and listed once an admin approves them.
        </p>
        <HostForm timeZone={appTimeZone()} />
      </details>

      <Suspense fallback={<ListSkeleton />}>
        <MyPrograms />
      </Suspense>

      <form method="get" className={styles.search} role="search">
        {category && <input type="hidden" name="category" value={category} />}
        <label className={styles.searchBox}>
          <Search size={18} aria-hidden="true" />
          <span style={{ position: 'absolute', left: '-9999px' }}>Search programs</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search program by topic, organizer, or location…"
            className={styles.searchInput}
            maxLength={100}
          />
        </label>
        <button type="submit" className={styles.button}>
          Search
        </button>
      </form>

      <nav aria-label="Filter by category" className={styles.chips}>
        <Link
          href={href()}
          className={`${styles.chip} ${!category ? styles.chipActive : ''}`}
          aria-current={!category ? 'true' : undefined}
        >
          All Programs
        </Link>
        {PROGRAM_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={href(c)}
            className={`${styles.chip} ${category === c ? styles.chipActive : ''}`}
            aria-current={category === c ? 'true' : undefined}
          >
            {CATEGORY_LABELS[c]}
          </Link>
        ))}
      </nav>

      {/* Everything above paints at once; only this list waits on Clerk and the database. */}
      <Suspense key={`${q}|${category ?? ''}`} fallback={<ListSkeleton />}>
        <ProgramResults q={q} category={category} />
      </Suspense>
    </main>
  );
}
