import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, getUser } = vi.hoisted(() => ({
  auth: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth,
  clerkClient: async () => ({ users: { getUser } }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

import { adminPageGuard, isAdminClaims, requireAdmin } from '@/lib/roles';

beforeEach(() => {
  auth.mockReset();
  getUser.mockReset();
});

describe('admin page guard', () => {
  it('reads the admin role only from the exact session claim', () => {
    expect(isAdminClaims({ metadata: { role: 'admin' } })).toBe(true);
    expect(isAdminClaims({ metadata: { role: 'Admin' } })).toBe(false);
    expect(isAdminClaims({ metadata: { role: 'member' } })).toBe(false);
    expect(isAdminClaims(null)).toBe(false);
  });

  it('rejects a signed-out visitor and a signed-in non-admin', async () => {
    auth.mockResolvedValue({ userId: null, sessionClaims: null });
    expect(await requireAdmin()).toEqual({ ok: false, reason: 'signed_out' });

    auth.mockResolvedValue({
      userId: 'user_member',
      sessionClaims: { metadata: { role: 'member' } },
    });
    expect(await requireAdmin()).toEqual({ ok: false, reason: 'forbidden' });
    await expect(adminPageGuard()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('accepts an admin from the session claim without calling Clerk', async () => {
    auth.mockResolvedValue({
      userId: 'user_admin',
      sessionClaims: { metadata: { role: 'admin' } },
    });
    expect(await requireAdmin()).toEqual({ ok: true, userId: 'user_admin' });
    expect(getUser).not.toHaveBeenCalled();
    expect(await adminPageGuard()).toEqual({ userId: 'user_admin' });
  });

  it('fails closed when the Clerk lookup throws', async () => {
    auth.mockResolvedValue({ userId: 'user_member', sessionClaims: {} });
    getUser.mockRejectedValue(new Error('clerk down'));
    expect(await requireAdmin()).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('uses publicMetadata.role when the session has no role claim', async () => {
    auth.mockResolvedValue({ userId: 'user_admin', sessionClaims: {} });
    getUser.mockResolvedValue({ publicMetadata: { role: 'admin' } });
    expect(await requireAdmin()).toEqual({ ok: true, userId: 'user_admin' });
  });
});
