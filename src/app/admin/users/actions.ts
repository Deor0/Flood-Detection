'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { canBan, canRevokeAdmin } from '@/core/admin/rules';
import { requireAdmin } from '@/lib/roles';

type Outcome = { ok: true; message: string } | { ok: false; message: string };

const isId = (v: unknown): v is string => typeof v === 'string' && /^user_[A-Za-z0-9]+$/.test(v);

/** Count admins by paging the full user list. Throws on failure so callers fail closed. */
async function countAdmins(): Promise<number> {
  const client = await clerkClient();
  const pageSize = 100;
  let admins = 0;
  for (let offset = 0; ; offset += pageSize) {
    const { data } = await client.users.getUserList({ limit: pageSize, offset });
    admins += data.filter((u) => u.publicMetadata?.role === 'admin').length;
    if (data.length < pageSize) return admins;
  }
}

/**
 * Admin-role changes (grant, revoke, ban) run one at a time under a database advisory lock, so two
 * admins demoting each other, or banning while the other is promoted, cannot interleave their
 * "count, then update" steps. Clerk is the source of truth; the lock only orders our own requests.
 */
async function withAdminLock<T>(fn: () => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admin-role-changes'))`);
    return fn();
  });
}

async function run(
  fd: FormData,
  op: (actorId: string, targetId: string) => Promise<Outcome>,
): Promise<never> {
  // Authorize first, before reading anything else from the request.
  const check = await requireAdmin();
  let outcome: Outcome;
  if (!check.ok) {
    outcome = { ok: false, message: 'Admin access is required.' };
  } else {
    const targetId = fd.get('userId');
    if (!isId(targetId)) {
      outcome = { ok: false, message: 'Unknown user.' };
    } else {
      try {
        outcome = await op(check.userId, targetId);
      } catch (err) {
        console.error('admin user action failed', err);
        outcome = { ok: false, message: 'That did not work. Nothing was changed.' };
      }
    }
  }
  revalidatePath('/admin/users');
  redirect(`/admin/users?${outcome.ok ? 'ok' : 'error'}=${encodeURIComponent(outcome.message)}`);
}

export async function grantAdminAction(fd: FormData): Promise<void> {
  await run(fd, (_actor, targetId) =>
    withAdminLock(async () => {
      await (
        await clerkClient()
      ).users.updateUserMetadata(targetId, {
        publicMetadata: { role: 'admin' },
      });
      return { ok: true, message: 'Admin access granted.' } as Outcome;
    }),
  );
}

export async function revokeAdminAction(fd: FormData): Promise<void> {
  await run(fd, (actorId, targetId) =>
    withAdminLock(async (): Promise<Outcome> => {
      const verdict = canRevokeAdmin({ actorId, targetId, adminCount: await countAdmins() });
      if (!verdict.ok) return { ok: false, message: verdict.reason };
      const client = await clerkClient();
      // null deletes the key from publicMetadata
      await client.users.updateUserMetadata(targetId, { publicMetadata: { role: null } });
      // Re-check after the write (another server instance has its own connection pool but the same
      // database lock; this is the last line of defence): never leave the app with no admin.
      if ((await countAdmins()) < 1) {
        await client.users.updateUserMetadata(targetId, { publicMetadata: { role: 'admin' } });
        return { ok: false, message: 'The last remaining admin cannot be demoted.' };
      }
      return { ok: true, message: 'Admin access removed.' };
    }),
  );
}

export async function banUserAction(fd: FormData): Promise<void> {
  await run(fd, (actorId, targetId) =>
    withAdminLock(async (): Promise<Outcome> => {
      const client = await clerkClient();
      const target = await client.users.getUser(targetId);
      const verdict = canBan({
        actorId,
        targetId,
        targetIsAdmin: target.publicMetadata?.role === 'admin',
      });
      if (!verdict.ok) return { ok: false, message: verdict.reason };
      await client.users.banUser(targetId);
      return { ok: true, message: 'User banned.' };
    }),
  );
}

export async function unbanUserAction(fd: FormData): Promise<void> {
  await run(fd, async (_actor, targetId) => {
    await (await clerkClient()).users.unbanUser(targetId);
    return { ok: true, message: 'User unbanned.' };
  });
}
