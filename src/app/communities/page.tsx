import { auth } from '@clerk/nextjs/server';
import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { getDb } from '@/db';
import { PROGRAM_CATEGORIES } from '@/db/schema';
import { CATEGORY_BADGES, CATEGORY_LABELS } from '@/core/programs/categories';
import { listPrograms } from '@/core/programs/service';
import styles from '@/components/page-ui.module.css';
import { HostForm, RegisterButton } from './ProgramForms';

export const dynamic = 'force-dynamic';

const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

function when(start: Date, end: Date) {
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${day.format(start)}, ${clock.format(start)} – ${clock.format(end)}`
    : `${day.format(start)}, ${clock.format(start)} – ${day.format(end)}, ${clock.format(end)}`;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = first(params.q).slice(0, 100);
  const category = PROGRAM_CATEGORIES.find((c) => c === first(params.category));
  const { userId } = await auth();

  let items: Awaited<ReturnType<typeof listPrograms>> = [];
  let loadError = false;
  try {
    items = await listPrograms(getDb(), { q, category, userId: userId ?? undefined });
  } catch (err) {
    console.error('communities page load failed', err);
    loadError = true;
  }

  const link = (cat?: string) => {
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
            Verified local disaster preparedness drills, first-aid workshops, flood safety sessions,
            and emergency volunteer briefings happening nearby.
          </p>
        </div>
      </div>

      <details className={styles.panel}>
        <summary>+ Host / Register Program</summary>
        <HostForm />
      </details>

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
        <a
          href={link()}
          className={`${styles.chip} ${!category ? styles.chipActive : ''}`}
          aria-current={!category ? 'true' : undefined}
        >
          All Programs
        </a>
        {PROGRAM_CATEGORIES.map((c) => (
          <a
            key={c}
            href={link(c)}
            className={`${styles.chip} ${category === c ? styles.chipActive : ''}`}
            aria-current={category === c ? 'true' : undefined}
          >
            {CATEGORY_LABELS[c]}
          </a>
        ))}
      </nav>

      {loadError ? (
        <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
          Could not load programs. Try again in a moment.
        </p>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          {q || category
            ? 'No upcoming programs match your search.'
            : 'No upcoming programs yet. Use “Host / Register Program” to list one.'}
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((p) => {
            const isFull = p.spotsLeft === 0;
            const low = p.spotsLeft !== null && p.spotsLeft > 0 && p.spotsLeft <= 10;
            return (
              <li key={p.id} className={styles.program}>
                <div>
                  <div className={styles.programTop}>
                    <span className={styles.type}>{CATEGORY_BADGES[p.category]}</span>
                    <span className={styles.organizer}>Organized by {p.organizer}</span>
                    {low && (
                      <span className={`${styles.pill} ${styles.pillWarn}`}>
                        {p.spotsLeft} spots left
                      </span>
                    )}
                    {isFull && <span className={`${styles.pill} ${styles.pillWarn}`}>Full</span>}
                    {p.capacity === null && (
                      <span className={`${styles.pill} ${styles.pillOk}`}>Open Access</span>
                    )}
                  </div>
                  <h2 className={styles.programTitle}>{p.title}</h2>
                  <div className={styles.facts}>
                    <span className={styles.fact}>
                      <MapPin size={15} aria-hidden="true" /> {p.location}
                    </span>
                    <span className={styles.fact}>
                      <CalendarDays size={15} aria-hidden="true" /> {when(p.startsAt, p.endsAt)}
                    </span>
                    <span className={styles.fact}>
                      <Users size={15} aria-hidden="true" /> {p.registered} registered
                      {p.capacity !== null ? ` • ${p.capacity} capacity` : ''}
                    </span>
                  </div>
                  {p.topics && (
                    <p className={styles.topics}>
                      <strong>Key Topics:</strong> {p.topics}
                    </p>
                  )}
                </div>
                <div className={styles.programSide}>
                  <RegisterButton programId={p.id} isRegistered={p.isRegistered} isFull={isFull} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
