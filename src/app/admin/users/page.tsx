import { clerkClient } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListSkeleton } from '@/components/ListSkeleton';
import ui from '@/components/page-ui.module.css';
import { adminPageGuard } from '@/lib/roles';
import { banUserAction, grantAdminAction, revokeAdminAction, unbanUserAction } from './actions';
import styles from './users.module.css';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 20;

type Search = { page?: string | string[]; ok?: string | string[]; error?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { userId: me } = await adminPageGuard();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);
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
      <Suspense key={page} fallback={<ListSkeleton />}>
        <UserTable page={page} me={me} />
      </Suspense>
    </main>
  );
}

function Confirm({
  label,
  warning,
  action,
  userId,
}: {
  label: string;
  warning: string;
  action: (fd: FormData) => Promise<void>;
  userId: string;
}) {
  return (
    <details className={styles.confirm}>
      <summary>{label}</summary>
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

async function UserTable({ page, me }: { page: number; me: string }) {
  let data, total;
  try {
    const client = await clerkClient();
    ({ data, totalCount: total } = await client.users.getUserList({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      orderBy: '-created_at',
    }));
  } catch (err) {
    console.error('user list failed', err);
    return <p className={ui.empty}>The user list is unavailable right now.</p>;
  }
  if (data.length === 0) return <p className={ui.empty}>No users on this page.</p>;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <p className={ui.count}>{total} users</p>
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
        {page > 1 && <Link href={`/admin/users?page=${page - 1}`}>Previous</Link>}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages && <Link href={`/admin/users?page=${page + 1}`}>Next</Link>}
      </div>
    </>
  );
}
