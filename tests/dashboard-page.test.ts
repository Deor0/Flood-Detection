import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceUnder(dir: string): string {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return [sourceUnder(path)];
      return name.endsWith('.tsx') || name.endsWith('.ts') ? [readFileSync(path, 'utf8')] : [];
    })
    .join('\n');
}

describe('dashboard screen', () => {
  it('paints a shell immediately and loads the map only in the browser', () => {
    const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
    const loading = readFileSync('src/app/dashboard/loading.tsx', 'utf8');
    const loader = readFileSync('src/app/dashboard/FloodMapLoader.tsx', 'utf8');

    expect(page).toContain('<Suspense');
    expect(page).toContain('ListSkeleton');
    expect(page).not.toContain('ssr: false');
    expect(loading.length).toBeGreaterThan(0);
    expect(loader).toContain('dynamic(');
    expect(loader).toContain('ssr: false');
  });

  it('shows the live and replay modes, the badges, and the six disclaimers', () => {
    const source = sourceUnder('src/app/dashboard');
    expect(source).toContain('Live');
    expect(source).toContain('Replay: Nepal Aug 2026');
    for (const badge of ['LIVE', 'REPLAY', 'SIMULATION']) expect(source).toContain(badge);
    expect(source).toMatch(/not an official forecast/i);
    expect(source).toMatch(/1984/);
    expect(source).toMatch(/bankfull/i);
    expect(source).toMatch(/30 m/);
    expect(source).toMatch(/debris flow/i);
    expect(source).toMatch(/estimates/i);
  });
});
