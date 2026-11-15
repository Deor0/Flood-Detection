import { cache } from 'react';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { notFound, unstable_rethrow } from 'next/navigation';

/**
 * Admin = Clerk `publicMetadata.role === 'admin'`. publicMetadata can only be written from the
 * backend; never use `unsafeMetadata` (the sign-up form writes that) for roles.
 */
export type Viewer = { userId: string | null; isAdmin: boolean };

type RoleClaims = { metadata?: { role?: unknown } } | null | undefined;

export function isAdminClaims(claims: RoleClaims): boolean {
  return claims?.metadata?.role === 'admin';
}

/**
 * Who is looking. Uses the `metadata.role` session claim when the Clerk session token is set up to
 * carry it; otherwise falls back to one Clerk Backend lookup (cached per request).
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  let session: Awaited<ReturnType<typeof auth>>;
  try {
    session = await auth();
  } catch (err) {
    unstable_rethrow(err); // let Next's own signals (dynamic rendering, redirects) through
    // Requests the proxy skips (e.g. a missing static file rendering the 404 page inside the root
    // layout) have no Clerk context and auth() throws. Treat them as signed out.
    console.warn('auth() unavailable, treating as signed out', (err as Error).message);
    return { userId: null, isAdmin: false };
  }
  const { userId, sessionClaims } = session;
  if (!userId) return { userId: null, isAdmin: false };
  if (isAdminClaims(sessionClaims as RoleClaims)) return { userId, isAdmin: true };
  if (
    (sessionClaims as RoleClaims)?.metadata &&
    'role' in ((sessionClaims as RoleClaims)!.metadata as object)
  ) {
    return { userId, isAdmin: false }; // the claim is present and says "not admin"
  }
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return { userId, isAdmin: user.publicMetadata?.role === 'admin' };
  } catch (err) {
    console.error('role lookup failed', err);
    return { userId, isAdmin: false }; // fail closed
  }
});

export type AdminCheck =
  { ok: true; userId: string } | { ok: false; reason: 'signed_out' | 'forbidden' };

/** For server actions and route handlers: never trust the client, check here. */
export async function requireAdmin(): Promise<AdminCheck> {
  const viewer = await getViewer();
  if (!viewer.userId) return { ok: false, reason: 'signed_out' };
  if (!viewer.isAdmin) return { ok: false, reason: 'forbidden' };
  return { ok: true, userId: viewer.userId };
}

/** For admin pages: non-admins get a 404, so the page's existence is not revealed. */
export async function adminPageGuard(): Promise<{ userId: string }> {
  const check = await requireAdmin();
  if (!check.ok) notFound();
  return { userId: check.userId };
}
