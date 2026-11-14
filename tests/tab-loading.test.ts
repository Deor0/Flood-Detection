import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ListSkeleton } from '@/components/ListSkeleton';
import MissingLoading from '@/app/missing/loading';
import CommunitiesLoading from '@/app/communities/loading';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

describe('instant tab shell', () => {
  it('renders a list skeleton the results can fall back to', () => {
    const html = renderToStaticMarkup(createElement(ListSkeleton));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading records');
  });

  it('shows the Missing People shell immediately', () => {
    const html = renderToStaticMarkup(createElement(MissingLoading));

    expect(html).toContain('Missing Persons Registry');
    expect(html).toContain('aria-busy="true"');
  });

  it('shows the Communities shell immediately', () => {
    const html = renderToStaticMarkup(createElement(CommunitiesLoading));

    expect(html).toContain('Community Awareness Programs');
    expect(html).toContain('aria-busy="true"');
  });

  it('does not wait on the database before painting the missing page', () => {
    const page = source('src/app/missing/page.tsx');

    expect(page).toContain('<Suspense');
    expect(page).toContain('ListSkeleton');
    expect(page).not.toContain('await searchMissing');
  });

  it('does not wait on the database before painting the communities page', () => {
    const page = source('src/app/communities/page.tsx');

    expect(page).toContain('<Suspense');
    expect(page).toContain('ListSkeleton');
    expect(page).toContain("from 'next/link'");
    expect(page).not.toContain('await listPrograms');
    expect(page).not.toContain('await auth(');
    expect(page).not.toContain('<a');
  });
});
