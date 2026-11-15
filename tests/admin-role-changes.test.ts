import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  banUser,
  dbAdminLock,
  grantAdmin,
  listActiveAdminIds,
  revokeAdmin,
  type AdminLock,
  type RoleUser,
  type RoleUsersApi,
} from '@/core/admin/roleChanges';
import { createTestDb } from './db';

/** In-memory Clerk users API that records whether each call ran inside the lock. */
function fakeClerk(initial: RoleUser[]) {
  const users = new Map(initial.map((u) => [u.id, { ...u }]));
  const calls: { name: string; inLock: boolean }[] = [];
  let inLock = false;
  const lock: AdminLock = async (fn) => {
    inLock = true;
    try {
      return await fn();
    } finally {
      inLock = false;
    }
  };
  const api: RoleUsersApi = {
    async getUserList({ limit, offset = 0, userId }) {
      calls.push({ name: userId ? 'getUserList(ids)' : 'getUserList(page)', inLock });
      const all = [...users.values()].filter((u) => !userId || userId.includes(u.id));
      return { data: all.slice(offset, offset + limit).map((u) => ({ ...u })) };
    },
    async getUser(id) {
      calls.push({ name: 'getUser', inLock });
      const u = users.get(id);
      if (!u) throw new Error('not found');
      return { ...u };
    },
    async updateUserMetadata(id, { publicMetadata }) {
      calls.push({ name: 'update', inLock });
      const u = users.get(id)!;
      u.publicMetadata = { role: publicMetadata.role ?? undefined };
    },
    async banUser(id) {
      calls.push({ name: 'ban', inLock });
      users.get(id)!.banned = true;
    },
  };
  return { api, lock, users, calls };
}

const admin = (id: string, extra: Partial<RoleUser> = {}): RoleUser => ({
  id,
  publicMetadata: { role: 'admin' },
  ...extra,
});
const member = (id: string): RoleUser => ({ id, publicMetadata: {} });

describe('admin role changes: Clerk paging happens before the lock', () => {
  it('pages the whole user list outside the lock and writes inside it', async () => {
    const many = Array.from({ length: 250 }, (_, i) => member(`user_m${i}`));
    const c = fakeClerk([admin('user_a'), admin('user_b'), ...many]);
    const r = await revokeAdmin({ users: c.api, lock: c.lock }, 'user_a', 'user_b');
    expect(r).toEqual({ ok: true, message: 'Admin access removed.' });
    const paged = c.calls.filter((x) => x.name === 'getUserList(page)');
    expect(paged.length).toBe(3);
    expect(paged.every((x) => !x.inLock)).toBe(true);
    // Inside the lock: one bounded re-check and the write.
    expect(c.calls.filter((x) => x.inLock).map((x) => x.name)).toEqual([
      'getUserList(ids)',
      'update',
    ]);
    expect(c.users.get('user_b')!.publicMetadata?.role).toBeUndefined();
  });

  it('refuses self-demotion without any Clerk call', async () => {
    const c = fakeClerk([admin('user_a'), admin('user_b')]);
    const r = await revokeAdmin({ users: c.api, lock: c.lock }, 'user_a', 'user_a');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/your own admin role/);
    expect(c.calls).toEqual([]);
  });

  it('refuses to demote the last admin', async () => {
    const c = fakeClerk([admin('user_a'), member('user_x')]);
    // Another admin (not in Clerk as admin any more) tries to demote user_a.
    const r = await revokeAdmin({ users: c.api, lock: c.lock }, 'user_ghost', 'user_a');
    expect(r).toEqual({ ok: false, message: 'The last remaining admin cannot be demoted.' });
    expect(c.users.get('user_a')!.publicMetadata?.role).toBe('admin');
  });

  it('re-checks inside the lock: two admins demoting each other leave one admin', async () => {
    const c = fakeClerk([admin('user_a'), admin('user_b')]);
    // Real interleaving: both read the list before either takes the lock.
    const queue: (() => void)[] = [];
    let held = false;
    const serial: AdminLock = async (fn) => {
      while (held) await new Promise<void>((r) => queue.push(r));
      held = true;
      try {
        return await fn();
      } finally {
        held = false;
        queue.shift()?.();
      }
    };
    const [r1, r2] = await Promise.all([
      revokeAdmin({ users: c.api, lock: serial }, 'user_a', 'user_b'),
      revokeAdmin({ users: c.api, lock: serial }, 'user_b', 'user_a'),
    ]);
    expect([r1.ok, r2.ok].sort()).toEqual([false, true]);
    const admins = [...c.users.values()].filter((u) => u.publicMetadata?.role === 'admin');
    expect(admins).toHaveLength(1);
  });

  it('bans only non-admins, checking the role inside the lock', async () => {
    const c = fakeClerk([admin('user_a'), member('user_x'), admin('user_b')]);
    expect(await banUser({ users: c.api, lock: c.lock }, 'user_a', 'user_x')).toEqual({
      ok: true,
      message: 'User banned.',
    });
    expect(c.calls.find((x) => x.name === 'getUser')?.inLock).toBe(true);
    const r = await banUser({ users: c.api, lock: c.lock }, 'user_a', 'user_b');
    expect(r.ok).toBe(false);
    expect(c.users.get('user_b')!.banned).toBeFalsy();
    const self = await banUser({ users: c.api, lock: c.lock }, 'user_a', 'user_a');
    expect(self.ok).toBe(false);
  });

  it('grants admin', async () => {
    const c = fakeClerk([admin('user_a'), member('user_x')]);
    expect((await grantAdmin({ users: c.api, lock: c.lock }, 'user_x')).ok).toBe(true);
    expect(c.users.get('user_x')!.publicMetadata?.role).toBe('admin');
  });
});

describe('banned admins do not count as admins', () => {
  it('leaves banned admins out of the active admin list', async () => {
    const c = fakeClerk([admin('user_a'), admin('user_b', { banned: true }), member('user_x')]);
    expect(await listActiveAdminIds(c.api)).toEqual(['user_a']);
  });

  it('refuses to demote the only active admin even if a banned admin exists', async () => {
    const c = fakeClerk([admin('user_a'), admin('user_b', { banned: true })]);
    const r = await revokeAdmin({ users: c.api, lock: c.lock }, 'user_b', 'user_a');
    expect(r).toEqual({ ok: false, message: 'The last remaining admin cannot be demoted.' });
  });

  it('allows removing the role from a banned admin while an active admin remains', async () => {
    const c = fakeClerk([admin('user_a'), admin('user_b', { banned: true })]);
    const r = await revokeAdmin({ users: c.api, lock: c.lock }, 'user_a', 'user_b');
    expect(r.ok).toBe(true);
  });
});

describe('database advisory lock', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('runs the body inside a transaction holding the lock and returns its value', async () => {
    const lock = dbAdminLock(ctx.db);
    expect(await lock(async () => 42)).toBe(42);
    await expect(
      lock(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await lock(async () => 'again')).toBe('again');
  });
});
