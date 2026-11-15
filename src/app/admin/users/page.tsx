import { clerkClient } from '@clerk/nextjs/server';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import ui from '@/components/page-ui.module.css';
import { adminPageGuard } from '@/lib/roles';
import { banUserAction, grantAdminAction, revokeAdminAction, unbanUserAction } from './actions';
import styles from './users.module.css';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 20;

type Search = {
  page?: string | string[];
  q?: string | string[];
  ok?: string | string[];
  error?: string | string[];
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { userId: me } = await adminPageGuard();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const ok = one(sp.ok)?.slice(0, 200);
  const error = one(sp.error)?.slice(0, 200);
  return (
    <main className={ui.page}>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Users</h1>
          <p className={ui.lede}>Grant or remove admin access, and ban or unban accounts.</p>
        </div>
      </div>
      {ok && (
        <p className={`${ui.banner} ${ui.bannerOk}`} role="status">
          {ok}
        </p>
      )}
      {error && (
        <p className={`${ui.banner} ${ui.bannerError}`} role="alert">
          {error}
        </p>
      )}
      <form method="get" className={ui.search} role="search">
        <label className={ui.searchBox}>
          <Search size={18} aria-hidden="true" />
          <span style={{ position: 'absolute', left: '-9999px' }}>Search by email</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by email…"
            className={ui.searchInput}
            maxLength={100}
          />
        </label>
        <button type="submit" className={ui.button}>
          Search
        </button>
      </form>
      <Suspense key={`${page}|${q}`} fallback={<ListSkeleton />}>
        <UserTable page={page} me={me} q={q} />
      </Suspense>
    </main>
  );
}

function Confirm({
  label,
  subtitle,
  warning,
  action,
  userId,
}: {
  label: string;
  subtitle?: string;
  warning: string;
  action: (fd: FormData) => Promise<void>;
  userId: string;
}) {
  return (
    <details className={styles.confirm}>
      <summary>
        {label}
        {subtitle && <span className={styles.sub}> · {subtitle}</span>}
      </summary>
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <span className={styles.confirmText}>{warning}</span>
        <button type="submit" className={ui.smallButton}>
          Confirm: {label}
        </button>
      </form>
    </details>
  );
}

async function UserTable({ page, me, q }: { page: number; me: string; q: string }) {
  let data, total;
  try {
    const client = await clerkClient();
    ({ data, totalCount: total } = await client.users.getUserList({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      orderBy: '-created_at',
      // Partial, case-insensitive email match.
      ...(q ? { emailAddress: [q] } : {}),
    }));
  } catch (err) {
    console.error('user list failed', err);
    return <p className={ui.empty}>The user list is unavailable right now.</p>;
  }
  if (data.length === 0)
    return (
      <p className={ui.empty}>
        {q ? `No users with an email matching “${q}”.` : 'No users on this page.'}
      </p>
    );
  const qs = q ? `&q=${encodeURIComponent(q)}` : '';
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <p className={ui.count}>
        {total} users{q ? ` matching “${q}”` : ''}
      </p>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>State</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => {
              const admin = u.publicMetadata?.role === 'admin';
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '-';
              const email = u.emailAddresses.find(
                (e) => e.id === u.primaryEmailAddressId,
              )?.emailAddress;
              const phone = u.phoneNumbers.find(
                (p) => p.id === u.primaryPhoneNumberId,
              )?.phoneNumber;
              const self = u.id === me;
              return (
                <tr key={u.id}>
                  <td>
                    {name}
                    {self && <span className={styles.sub}> (you)</span>}
                  </td>
                  <td>{email ?? '-'}</td>
                  <td>{phone ?? '-'}</td>
                  <td>
                    <span className={`${styles.badge} ${admin ? styles.badgeAdmin : ''}`}>
                      {admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td>
                    {u.banned && (
                      <span className={`${styles.badge} ${styles.badgeBad}`}>Banned</span>
                    )}{' '}
                    {u.locked && (
                      <span className={`${styles.badge} ${styles.badgeBad}`}>Locked</span>
                    )}
                    {!u.banned && !u.locked && 'Active'}
                  </td>
                  <td>{new Date(u.createdAt).toISOString().slice(0, 10)}</td>
                  <td className={styles.actions}>
                    {admin ? (
                      !self && (
                        <Confirm
                          label="Remove admin"
                          warning="This user loses admin access."
                          action={revokeAdminAction}
                          userId={u.id}
                        />
                      )
                    ) : (
                      <Confirm
                        label="Make admin"
                        subtitle="Hand the bow"
                        warning="This user gets full admin access."
                        action={grantAdminAction}
                        userId={u.id}
                      />
                    )}
                    {u.banned ? (
                      <Confirm
                        label="Unban"
                        warning="This user can sign in again."
                        action={unbanUserAction}
                        userId={u.id}
                      />
                    ) : (
                      !self &&
                      !admin && (
                        <Confirm
                          label="Ban"
                          warning="This user is signed out and blocked."
                          action={banUserAction}
                          userId={u.id}
                        />
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.pager}>
        {page > 1 && <Link href={`/admin/users?page=${page - 1}${qs}`}>Previous</Link>}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages && <Link href={`/admin/users?page=${page + 1}${qs}`}>Next</Link>}
      </div>
    </>
  );
}
