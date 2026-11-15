import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const require = createRequire(import.meta.url);

const { protect, publicPatterns } = vi.hoisted(() => ({
  protect: vi.fn(async () => undefined),
  publicPatterns: [] as string[][],
}));

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher: (patterns: string[]) => {
    publicPatterns.push(patterns);
    return (req: { nextUrl: { pathname: string } }) => {
      const path = req.nextUrl.pathname;
      // Like Clerk's path-to-regexp matcher: `x(.*)` matches x and anything after it; a pattern
      // without `(.*)` (such as `/`) matches that exact path only.
      return patterns.some((pattern) => {
        if (!pattern.endsWith('(.*)')) return path === pattern;
        return path.startsWith(pattern.slice(0, -'(.*)'.length));
      });
    };
  },
  clerkMiddleware: (
    handler: (auth: { protect: typeof protect }, req: NextRequest) => Promise<unknown>,
  ) => {
    return (req: NextRequest) => {
      const auth = Object.assign(async () => ({ userId: null as string | null }), { protect });
      return handler(auth, req);
    };
  },
}));

import proxy, { config } from '@/proxy';

function incoming(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

beforeEach(() => {
  protect.mockClear();
});

describe('Clerk session gate', () => {
  it('keeps the read-only pages, sign-in, sign-up, the SMS webhook, and geo files public', async () => {
    expect(publicPatterns[0]).toEqual([
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
      '/sms-simulator(.*)',
      '/opengraph-image(.*)',
    ]);

    for (const path of [
      '/',
      '/find',
      '/guide',
      '/nepal',
      '/dashboard',
      '/missing',
      '/communities',
      '/api/flood',
      '/api/dem',
      '/sign-in',
      '/sign-in/factor-one',
      '/sign-up',
      '/api/sms',
      '/api/postsms',
      '/geo/place.json',
      '/demo',
      '/sms-simulator',
      '/opengraph-image',
    ]) {
      protect.mockClear();
      await proxy(incoming(path));
      expect(protect, path).not.toHaveBeenCalled();
    }
  });

  it('requires a Clerk session for admin', async () => {
    for (const path of ['/admin', '/admin/users', '/admin/missing']) {
      protect.mockClear();
      await proxy(incoming(path));
      expect(protect, path).toHaveBeenCalledOnce();
    }
  });

  it('runs Clerk on API routes and still skips Next internals in the matcher', () => {
    const matcher = config.matcher.join('\n');
    expect(matcher).toContain('/(api|trpc)(.*)');
    expect(matcher).toContain('_next');
  });

  it('does not depend on Auth0', () => {
    const pkg = require('../package.json') as { dependencies?: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty('@auth0/nextjs-auth0');
  });
});
