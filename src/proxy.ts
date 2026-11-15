import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Everything requires sign-in except Clerk's own pages, the SMS webhook (called by the SMS
// provider, not a person), static GeoJSON files and the saved-data demo page.
const isPublic = createRouteMatcher([
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
