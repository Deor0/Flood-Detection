import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => createElement('div', { 'data-clerk': 'user-button' }),
}));

import { Nav } from '@/components/Nav';

describe('admin tab', () => {
  it('shows the Admin tab only to an admin', () => {
    const member = renderToStaticMarkup(createElement(Nav, { isAdmin: false }));
    const admin = renderToStaticMarkup(createElement(Nav, { isAdmin: true }));

    expect(member).not.toContain('href="/admin"');
    expect(admin).toContain('href="/admin"');
    expect(admin).toContain('Admin');
  });
});
