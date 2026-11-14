'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
  await run(fd, async (_actor, targetId) => {
    await (
      await clerkClient()
    ).users.updateUserMetadata(targetId, {
      publicMetadata: { role: 'admin' },
    });
    return { ok: true, message: 'Admin access granted.' };
  });
}

export async function revokeAdminAction(fd: FormData): Promise<void> {
  await run(fd, async (actorId, targetId) => {
    const verdict = canRevokeAdmin({ actorId, targetId, adminCount: await countAdmins() });
    if (!verdict.ok) return { ok: false, message: verdict.reason };
    // null deletes the key from publicMetadata
    await (
      await clerkClient()
    ).users.updateUserMetadata(targetId, {
      publicMetadata: { role: null },
    });
    return { ok: true, message: 'Admin access removed.' };
  });
}

export async function banUserAction(fd: FormData): Promise<void> {
  await run(fd, async (actorId, targetId) => {
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
  });
}

export async function unbanUserAction(fd: FormData): Promise<void> {
  await run(fd, async (_actor, targetId) => {
    await (await clerkClient()).users.unbanUser(targetId);
    return { ok: true, message: 'User unbanned.' };
  });
}
