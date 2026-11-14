import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-clerk': 'provider' }, children),
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    createElement('div', { 'data-show': when }, children),
  UserButton: () => createElement('div', { 'data-clerk': 'user-button' }),
}));

import RootLayout from '@/app/layout';

describe('Clerk sign-out control', () => {
  it('shows the Clerk user button, which includes sign out, only when signed in', () => {
    const html = renderToStaticMarkup(createElement(RootLayout, { children: 'child' }));

    expect(html).toContain('data-clerk="provider"');
    expect(html).toContain('data-show="signed-in"');
    expect(html).toContain('data-clerk="user-button"');
    expect(html).not.toContain('/api/auth/logout');
    expect(html).not.toContain('/auth/logout');
  });
});
