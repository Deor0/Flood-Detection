import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('alert tables', () => {
  it('declares append-only flood alert tables', () => {
    const schema = readFileSync('src/db/schema.ts', 'utf8');
    expect(schema).toContain("pgTable('flood_alerts'");
    expect(schema).toContain("pgTable('flood_alert_events'");
    expect(schema).toMatch(/simulated\|real|simulated', 'real/);
    expect(schema).toMatch(/detected/);
  });
});
