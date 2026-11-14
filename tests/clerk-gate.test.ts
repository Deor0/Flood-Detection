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
      return patterns.some((pattern) => {
        const prefix = pattern.replace(/\(\.\*\)$/, '');
        return path === prefix || path.startsWith(prefix);
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
  it('keeps sign-in, sign-up, the SMS webhook, and geo files public', async () => {
    expect(publicPatterns[0]).toEqual([
      '/sign-in(.*)',
      '/sign-up(.*)',
      '/api/sms(.*)',
      '/geo/(.*)',
    ]);

    for (const path of ['/sign-in', '/sign-in/factor-one', '/sign-up', '/api/sms', '/geo/place.json']) {
      protect.mockClear();
      await proxy(incoming(path));
      expect(protect, path).not.toHaveBeenCalled();
    }
  });

  it('requires a Clerk session for the app pages', async () => {
    for (const path of ['/', '/dashboard', '/missing', '/communities']) {
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
