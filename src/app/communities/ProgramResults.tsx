import { auth } from '@clerk/nextjs/server';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { getDb } from '@/db';
import type { ProgramCategory } from '@/db/schema';
import { CATEGORY_BADGES } from '@/core/programs/categories';
import { listPrograms } from '@/core/programs/service';
import styles from '@/components/page-ui.module.css';
import { appTimeZone } from '@/lib/time';
import { SignInLink } from '@/components/SignInLink';
import { RegisterButton } from './ProgramForms';

const zone = appTimeZone();
const day = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: zone,
});
const clock = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: zone,
});

function when(start: Date, end: Date) {
  const sameDay = day.format(start) === day.format(end);
  return sameDay
    ? `${day.format(start)}, ${clock.format(start)} – ${clock.format(end)}`
    : `${day.format(start)}, ${clock.format(start)} – ${day.format(end)}, ${clock.format(end)}`;
}

/** The result list. This is the only part of the page that waits on Clerk and the database. */
export async function ProgramResults({ q, category }: { q: string; category?: ProgramCategory }) {
  const { userId } = await auth();

  let items: Awaited<ReturnType<typeof listPrograms>> = [];
  try {
    items = await listPrograms(getDb(), { q, category, userId: userId ?? undefined });
  } catch (err) {
    console.error('communities page load failed', err);
    return (
      <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
        Could not load programs. Try again in a moment.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        {q || category
          ? 'No upcoming programs match your search.'
          : userId
            ? 'No upcoming programs yet. Use “Host / Register Program” to list one.'
            : 'No upcoming programs yet.'}
      </div>
    );
  }

  return (
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
              {userId ? (
                <RegisterButton programId={p.id} isRegistered={p.isRegistered} isFull={isFull} />
              ) : (
                !isFull && <SignInLink small to="register" />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
