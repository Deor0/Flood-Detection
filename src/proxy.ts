import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Reading is public; changing data needs sign-in (server actions check the viewer themselves).
// Public: the home page (exact `/`), the read-only pages and the APIs they fetch, Clerk's own
// pages, the SMS webhooks (called by a provider, not a person), static GeoJSON and the demo.
// `/admin` and `/sms-simulator` stay behind sign-in. Clerk still runs on public routes, so
// `auth()` works there and reports a signed-out visitor as `userId: null`.
const isPublic = createRouteMatcher([
  '/',
  '/find(.*)',
  '/guide(.*)',
  '/nepal(.*)',
  '/dashboard(.*)',
  '/missing(.*)',
  '/communities(.*)',
  '/api/flood(.*)',
  '/api/dem(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/sms(.*)',
  '/api/postsms(.*)',
  '/geo/(.*)',
  '/demo(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
