import { Show } from '@clerk/nextjs';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { HelplineNote } from '@/components/HelplineNote';
import { ListSkeleton } from '@/components/ListSkeleton';
import { SignInLink } from '@/components/SignInLink';
import styles from '@/components/page-ui.module.css';
import { MissingResults, type StatusFilter } from './MissingResults';
import { ReportForm } from './MissingForms';
import { STATUS_LABEL } from './StatusBadge';
import local from './missing.module.css';

export const dynamic = 'force-dynamic';

export default async function MissingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : (params.q ?? '')).slice(0, 100);
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status: StatusFilter =
    rawStatus === 'missing' || rawStatus === 'found' ? rawStatus : undefined;
  const href = (s?: StatusFilter) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (s) p.set('status', s);
    const qs = p.toString();
    return qs ? `/missing?${qs}` : '/missing';
  };
  const chips: { value: StatusFilter; label: string }[] = [
    { value: undefined, label: 'All records' },
    { value: 'missing', label: STATUS_LABEL.missing },
    { value: 'found', label: STATUS_LABEL.found },
  ];

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={local.kicker}>The Long Way Home</p>
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
        {status && <input type="hidden" name="status" value={status} />}
        <button type="submit" className={styles.button}>
          Search
        </button>
      </form>

      <nav aria-label="Filter by status" className={styles.chips}>
        {chips.map((c) => (
          <Link
            key={c.label}
            href={href(c.value)}
            className={`${styles.chip} ${status === c.value ? styles.chipActive : ''}`}
            aria-current={status === c.value ? 'true' : undefined}
          >
            {c.label}
          </Link>
        ))}
      </nav>

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
      <Suspense key={`${q}|${status ?? ''}`} fallback={<ListSkeleton />}>
        <MissingResults q={q} status={status} />
      </Suspense>

      <HelplineNote heading="No internet? Report, search or mark found by phone." />
    </main>
  );
}
