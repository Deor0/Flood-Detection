import { NextResponse, type NextRequest } from 'next/server';
import { auth0 } from '@/lib/auth0';

const PUBLIC_PATHS = ['/login', '/register'];

export async function proxy(request: NextRequest) {
  // Mounts /auth/login, /auth/logout, /auth/callback, etc. and refreshes the session cookie.
  const response = await auth0.middleware(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/auth/')) return response;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isPublic) {
    const session = await auth0.getSession(request);
    if (!session) return NextResponse.redirect(new URL('/login', request.nextUrl));
  }
  return response;
}

export const config = {
  // /api/sms is excluded: it's called by the SMS provider, not a logged-in user.
  matcher: ['/((?!api/sms|_next/static|_next/image|favicon.ico|geo/).*)'],
};
