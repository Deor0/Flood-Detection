import { clerkClient } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { lastFirst, publicId } from '@/core/missing/names';
import {
  listEditRequests,
  missingHistory,
  searchMissing,
  type MissingPerson,
} from '@/core/missing/service';
import styles from '@/components/page-ui.module.css';
import { timeAgo } from '@/lib/time';
import { AdminRecordActions, ReviewButtons } from './AdminMissingForms';
import local from './admin-missing.module.css';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  age: 'Age',
  lastSeenLocation: 'Last seen',
  notes: 'Notes',
  contact: 'Contact',
};
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(empty)' : String(v));

/** Resolve Clerk ids to a name or email. Fails soft: unknown ids are shown as the id. */
async function resolveUsers(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const client = await clerkClient();
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          const u = await client.users.getUser(id);
          const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
          const email = u.emailAddresses?.[0]?.emailAddress;
          out.set(id, [name, email].filter(Boolean).join(' · ') || id);
        } catch {
          /* unknown user: fall back to the id */
        }
      }),
    );
  } catch {
    /* Clerk unavailable */
  }
  return out;
}

function valuesOf(p: MissingPerson) {
  return {
    name: p.name,
    age: p.age,
    lastSeenLocation: p.lastSeenLocation,
    notes: p.notes,
    contact: p.contact,
  };
}

export async function EditRequestQueue() {
  let items;
  try {
    items = await listEditRequests(getDb());
  } catch (err) {
    console.error('admin edit requests load failed', err);
    return (
      <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
        Could not load the review queue. Try again in a moment.
      </p>
    );
  }
  if (items.length === 0)
    return <div className={styles.empty}>No suggested edits are waiting.</div>;
  const users = await resolveUsers(items.map((i) => i.request.submittedByUserId));
  return (
    <ul className={styles.list}>
      {items.map(({ request, person, diff, stale }) => (
        <li key={request.id} className={styles.person}>
          <h3 className={styles.personName}>{lastFirst(person.name)}</h3>
          <p className={styles.personMeta}>
            ID: #{publicId(person.publicNumber)} • Suggested by{' '}
            {users.get(request.submittedByUserId) ?? request.submittedByUserId} •{' '}
            {timeAgo(request.createdAt)}
          </p>
          {stale && (
            <p role="alert" className={local.warn}>
              This record changed since the suggestion was made. Check the current values below.
            </p>
          )}
          <table className={local.diff}>
            <thead>
              <tr>
                <th>Field</th>
                <th>Current</th>
                <th>Proposed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(diff).map(([field, c]) => (
                <tr key={field}>
                  <th scope="row">{FIELD_LABELS[field] ?? field}</th>
                  <td className={local.from}>{show(c.from)}</td>
                  <td className={local.to}>{show(c.to)}</td>
                </tr>
              ))}
              {Object.keys(diff).length === 0 && (
                <tr>
                  <td colSpan={3}>The record already matches this suggestion.</td>
                </tr>
              )}
            </tbody>
          </table>
          <ReviewButtons requestId={request.id} />
        </li>
      ))}
    </ul>
  );
}

async function History({ id }: { id: string }) {
  const events = await missingHistory(getDb(), id);
  const users = await resolveUsers(
    events.map((e) => e.actorUserId).filter((x): x is string => !!x),
  );
  return (
    <ol className={local.timeline} aria-label="History">
      {events.map((e) => {
        const actor = e.actorUserId
          ? (users.get(e.actorUserId) ?? e.actorUserId)
          : (e.actorPhone ?? 'unknown');
        const changes = e.changes as Record<string, unknown> | null;
        const isDiff = e.kind === 'edited' || e.kind === 'edit_requested';
        return (
          <li key={e.id} className={local.event}>
            <strong>{e.kind.replace('_', ' ')}</strong> by {actor} • {timeAgo(e.createdAt)} (
            {e.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC)
            {e.reason && <div>Reason: {e.reason}</div>}
            {changes && isDiff && (
              <ul className={local.changes}>
                {Object.entries(changes).map(([f, c]) => {
                  const ch = c as { from: unknown; to: unknown };
                  return (
                    <li key={f}>
                      {FIELD_LABELS[f] ?? f}: {show(ch.from)} → {show(ch.to)}
                    </li>
                  );
                })}
              </ul>
            )}
            {changes && e.kind === 'found' && 'note' in changes && changes.note ? (
              <div className={local.changes}>Note: {String(changes.note)}</div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export async function RecordsWithHistory({ q }: { q: string }) {
  let people: MissingPerson[];
  try {
    people = await searchMissing(getDb(), q, 20);
  } catch (err) {
    console.error('admin missing load failed', err);
    return (
      <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
        Could not load the registry. Try again in a moment.
      </p>
    );
  }
  if (people.length === 0) return <div className={styles.empty}>No records match.</div>;
  return (
    <ul className={styles.list}>
      {people.map((p) => (
        <li key={p.id} className={styles.person}>
          <div className={styles.personTop}>
            <div>
              <h3 className={styles.personName}>{lastFirst(p.name)}</h3>
              <p className={styles.personMeta}>
                {p.age !== null && <>Age: {p.age} • </>}ID: #{publicId(p.publicNumber)}
              </p>
            </div>
            <span className={styles.badge}>{p.status === 'found' ? 'FOUND' : 'MISSING'}</span>
          </div>
          <div className={styles.personBody}>
            <span>
              {p.lastSeenLocation ?? 'Last location unknown'}
              {p.notes ? ` • ${p.notes}` : ''}
            </span>
            {p.contact && <span className={styles.contactLine}>Contact: {p.contact}</span>}
          </div>
          <AdminRecordActions id={p.id} status={p.status} values={valuesOf(p)} />
          <details>
            <summary>History</summary>
            <History id={p.id} />
          </details>
        </li>
      ))}
    </ul>
  );
}
