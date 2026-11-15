import { sql } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { canBan, canRevokeAdmin } from './rules';

/**
 * Admin-role changes (grant, revoke, ban) with Clerk as the source of truth.
 *
 * Shape of every change: do the slow, paged Clerk reads first with no database connection held,
 * then take a short advisory lock (one transaction) that re-checks only what can have changed
 * (one bounded Clerk call) and does the single write. The lock orders our own requests, so two
 * admins demoting each other cannot both pass the "someone else stays admin" check.
 */

export type Outcome = { ok: true; message: string } | { ok: false; message: string };

/** The small part of a Clerk user these rules read. */
export type RoleUser = {
  id: string;
  banned?: boolean;
  publicMetadata?: { role?: unknown } | null;
};

/** The small part of Clerk's `users` API these changes use (tests pass a fake). */
export type RoleUsersApi = {
  getUserList(params: {
    limit: number;
    offset?: number;
    userId?: string[];
  }): Promise<{ data: RoleUser[] }>;
  getUser(id: string): Promise<RoleUser>;
  updateUserMetadata(
    id: string,
    params: { publicMetadata: { role: 'admin' | null } },
  ): Promise<unknown>;
  banUser(id: string): Promise<unknown>;
};

/** Runs `fn` while holding the admin-role lock. */
export type AdminLock = <T>(fn: () => Promise<T>) => Promise<T>;

const PAGE = 100;

/** An admin who can actually act: role admin and not banned. A banned admin cannot sign in. */
export const isActiveAdmin = (u: RoleUser) => u.publicMetadata?.role === 'admin' && !u.banned;

/** Every active admin's id, by paging the full user list. Throws on failure (callers fail closed). */
export async function listActiveAdminIds(users: RoleUsersApi): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await users.getUserList({ limit: PAGE, offset });
    for (const u of data) if (isActiveAdmin(u)) ids.push(u.id);
    if (data.length < PAGE) return ids;
  }
}

/** Re-reads only the given ids (at most one call per 100) and keeps those still active admins. */
async function stillActiveAdmins(users: RoleUsersApi, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    const { data } = await users.getUserList({ limit: PAGE, userId: ids.slice(i, i + PAGE) });
    for (const u of data) if (isActiveAdmin(u)) out.push(u.id);
  }
  return out;
}

/** Postgres advisory lock held for one short transaction. */
export function dbAdminLock(db: AppDb): AdminLock {
  return (fn) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admin-role-changes'))`);
      return fn();
    });
}

export async function grantAdmin(
  deps: { users: RoleUsersApi; lock: AdminLock },
  targetId: string,
): Promise<Outcome> {
  return deps.lock(async () => {
    await deps.users.updateUserMetadata(targetId, { publicMetadata: { role: 'admin' } });
    return { ok: true, message: 'Admin access granted.' };
  });
}

export async function revokeAdmin(
  deps: { users: RoleUsersApi; lock: AdminLock },
  actorId: string,
  targetId: string,
): Promise<Outcome> {
  // Cheap refusal first (self-demote), before any network call.
  const self = canRevokeAdmin({ actorId, targetId, adminCount: 2 });
  if (!self.ok) return { ok: false, message: self.reason };

  // Slow part, no lock held: page through Clerk once.
  const others = (await listActiveAdminIds(deps.users)).filter((id) => id !== targetId);

  return deps.lock(async (): Promise<Outcome> => {
    // Re-check inside the lock: an admin demoted or banned meanwhile no longer counts. Admins
    // granted meanwhile are not in `others`, which only makes this check stricter (fail closed).
    const remaining = await stillActiveAdmins(deps.users, others);
    // canRevokeAdmin counts the target as one of the admins; what must survive is `remaining`.
    const verdict = canRevokeAdmin({ actorId, targetId, adminCount: remaining.length + 1 });
    if (!verdict.ok) return { ok: false, message: verdict.reason };
    await deps.users.updateUserMetadata(targetId, { publicMetadata: { role: null } });
    return { ok: true, message: 'Admin access removed.' };
  });
}

export async function banUser(
  deps: { users: RoleUsersApi; lock: AdminLock },
  actorId: string,
  targetId: string,
): Promise<Outcome> {
  const early = canBan({ actorId, targetId, targetIsAdmin: false });
  if (!early.ok) return { ok: false, message: early.reason };
  return deps.lock(async (): Promise<Outcome> => {
    // One call, inside the lock, so a promotion that just happened is seen.
    const target = await deps.users.getUser(targetId);
    const verdict = canBan({
      actorId,
      targetId,
      targetIsAdmin: target.publicMetadata?.role === 'admin',
    });
    if (!verdict.ok) return { ok: false, message: verdict.reason };
    await deps.users.banUser(targetId);
    return { ok: true, message: 'User banned.' };
  });
}
