import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { listMyRegistrations, type RegistrationNotice } from '@/core/programs/service';
import { appTimeZone } from '@/lib/time';
import { formatWhen } from './when';
import styles from './programs.module.css';

const NOTICE_LABEL: Record<RegistrationNotice, string> = {
  cancelled: 'Cancelled',
  under_review: 'Changed · under review',
  time_changed: 'Time changed',
  place_changed: 'Place changed',
};

/**
 * "My registrations": what the viewer signed up for. Cancelled or changed programs stay here with a
 * clear label, so nobody turns up to a shelter session that was called off.
 */
export async function MyRegistrations() {
  const { userId } = await auth();
  if (!userId) return null;
  let items: Awaited<ReturnType<typeof listMyRegistrations>> = [];
  try {
    items = await listMyRegistrations(getDb(), userId);
  } catch (err) {
    console.error('my registrations load failed', err);
    return (
      <p role="alert" className={styles.loadError}>
        Could not load your registrations. Refresh the page to try again.
      </p>
    );
  }
  if (items.length === 0) return null;
  const zone = appTimeZone();

  return (
    <section className={styles.section} aria-labelledby="my-registrations">
      <h2 id="my-registrations" className={styles.heading}>
        My registrations
      </h2>
      <ul className={styles.cardList}>
        {items.map((r) => {
          const cancelled = r.notices.includes('cancelled');
          return (
            <li key={r.id} className={styles.card}>
              <span
                className={`${styles.status} ${cancelled ? styles.cancelled : styles.approved}`}
              >
                {cancelled ? 'Cancelled' : 'Registered'}
              </span>
              {r.notices
                .filter((n) => n !== 'cancelled')
                .map((n) => (
                  <span key={n} className={styles.notice}>
                    {NOTICE_LABEL[n]}
                  </span>
                ))}
              <h3 className={styles.cardTitle}>{r.title}</h3>
              <p className={styles.meta}>
                {r.location} · {formatWhen(r.startsAt, r.endsAt, zone)}
              </p>
              {cancelled && (
                <p className={styles.reason}>
                  The host called this off. Do not travel to it; look for another program below.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
