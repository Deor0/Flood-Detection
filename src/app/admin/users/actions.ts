'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import {
  banUser,
  dbAdminLock,
  grantAdmin,
  revokeAdmin,
  type Outcome,
  type RoleUsersApi,
} from '@/core/admin/roleChanges';
import { requireAdmin } from '@/lib/roles';

const isId = (v: unknown): v is string => typeof v === 'string' && /^user_[A-Za-z0-9]+$/.test(v);

/**
 * Clerk reads happen before the database lock is taken (see `src/core/admin/roleChanges.ts`), so a
 * slow paged Clerk call never holds one of the request's few database connections.
 */
async function deps() {
  const client = await clerkClient();
  return { users: client.users as unknown as RoleUsersApi, lock: dbAdminLock(getDb()) };
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
  await run(fd, async (_actor, targetId) => grantAdmin(await deps(), targetId));
}

export async function revokeAdminAction(fd: FormData): Promise<void> {
  await run(fd, async (actorId, targetId) => revokeAdmin(await deps(), actorId, targetId));
}

export async function banUserAction(fd: FormData): Promise<void> {
  await run(fd, async (actorId, targetId) => banUser(await deps(), actorId, targetId));
}

export async function unbanUserAction(fd: FormData): Promise<void> {
  await run(fd, async (_actor, targetId) => {
    await (await clerkClient()).users.unbanUser(targetId);
    return { ok: true, message: 'User unbanned.' };
  });
}
