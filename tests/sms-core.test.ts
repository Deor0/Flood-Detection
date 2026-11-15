import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { missingPersons, smsLog } from '@/db/schema';
import { handleInboundSms } from '@/core/sms';
import { markFound, reportMissing } from '@/core/missing/service';
import { createTestDb } from './db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

// Texts are timed in the recent past, so a person marked found "now" is newer than them.
let clock = Date.now() - 60 * 60 * 1000;
/** Each text a few seconds after the last one, unless a time is given. */
function text(from: string, body: string, at?: Date) {
  clock += 5_000;
  return handleInboundSms(ctx.db, { from, body, receivedAt: at ?? new Date(clock) });
}

const people = (name: string) =>
  ctx.db.select().from(missingPersons).where(eq(missingPersons.name, name));

describe('duplicate texts', () => {
  it('answers a repeated MISSING with the first reply and files one report', async () => {
    const phone = '+14155550101';
    const first = await text(phone, 'MISSING Dupe Person, Rasuwa, 40');
    const second = await text(phone, 'missing  Dupe Person, Rasuwa, 40');
    expect(first.reply).toMatch(/REG-\d{5}/);
    expect(second.reply).toBe(first.reply);
    expect(await people('Dupe Person')).toHaveLength(1);
    const logs = await ctx.db.select().from(smsLog).where(eq(smsLog.fromPhone, phone));
    expect(logs.map((l) => l.command).sort()).toEqual(['DUPLICATE', 'MISSING']);
  });

  it('files again after the window has passed', async () => {
    const phone = '+14155550102';
    const t0 = new Date('2026-11-15T10:00:00Z');
    await text(phone, 'MISSING Window Person', t0);
    await text(phone, 'MISSING Window Person', new Date(t0.getTime() + 3 * 60 * 1000));
    expect(await people('Window Person')).toHaveLength(2);
  });

  it('runs a repeated SEARCH again (read-only commands are not de-duplicated)', async () => {
    const phone = '+14155550103';
    const before = await text(phone, 'SEARCH Fresh Person');
    expect(before.reply).toMatch(/No record found/);
    await reportMissing(ctx.db, { userId: 'web-user-1' }, { name: 'Fresh Person' });
    const after = await text(phone, 'SEARCH Fresh Person');
    expect(after.reply).toMatch(/Fresh Person: MISSING/);
  });
});

describe('forgiving commands', () => {
  it('files a report with an unreadable age instead of refusing it', async () => {
    const reply = await text('+14155550104', 'LOST: Agey Person, Rasuwa, unknown');
    expect(reply.reply).toMatch(/Report saved as REG-\d{5}/);
    const [p] = await people('Agey Person');
    expect(p.age).toBeNull();
    expect(p.lastSeenLocation).toBe('Rasuwa');
  });

  it('shows only a coarse region in SEARCH results', async () => {
    await text('+14155550105', 'MISSING Street Person, 12 Ganga Path Ward 3, Kathmandu, 50');
    const { reply } = await text('+14155550106', 'FIND Street Person');
    expect(reply).toMatch(/Street Person: MISSING \(Kathmandu\)/);
    expect(reply).not.toMatch(/Ganga Path/);
  });

  it('marks found by public id, only from the reporting phone', async () => {
    const owner = '+14155550107';
    const saved = await text(owner, 'MISSING Id Person, Rasuwa');
    const id = /REG-\d{5}/.exec(saved.reply)?.[0] as string;
    const stranger = await text('+14155550108', `FOUND ${id}`);
    expect(stranger.reply).toMatch(/Only the phone that reported/);
    expect((await people('Id Person'))[0].status).toBe('missing');
    const mine = await text(owner, `SAFE ${id.toLowerCase()}`);
    expect(mine.reply).toMatch(new RegExp(`${id} Id Person is now marked FOUND`));
    expect((await people('Id Person'))[0].status).toBe('found');
    const again = await text(owner, `safe ${id.toLowerCase()} `);
    expect(again.reply).toBe(mine.reply); // a double send, answered once
    const later = await text(owner, `FOUND ${id}`); // a different text: runs, record already found
    expect(later.reply).toMatch(/already marked found/);
  });

  it('says so for an unknown public id', async () => {
    const { reply } = await text('+14155550109', 'FOUND REG-99999');
    expect(reply).toMatch(/No record REG-99999/);
  });

  it('answers STATUS from saved river data', async () => {
    const { reply } = await text('+14155550110', 'STATUS Kathmandu');
    expect(reply).toMatch(/^SIMULATION/);
    expect(reply).toMatch(/higher ground/);
  });
});

describe('reunion notices', () => {
  it('tells the reporter, on their next text, that someone marked their person found', async () => {
    clock = Date.now() - 10 * 60 * 1000;
    const phone = '+14155550111';
    const saved = await text(phone, 'MISSING Reunion Person, Rasuwa, 30');
    const id = /REG-\d{5}/.exec(saved.reply)?.[0] as string;
    const [p] = await people('Reunion Person');
    const done = await markFound(ctx.db, { userId: 'web-finder', isAdmin: true }, p.id, 'At camp');
    expect(done.ok).toBe(true);

    clock = Date.now() + 60_000;
    const next = await text(phone, 'HELP');
    expect(next.reply).toMatch(
      new RegExp(`^Good news: ${id} Reunion Person is home safe\\. Commands:`),
    );
    expect(next.reply).not.toMatch(/At camp/);
    expect(next.reply.length).toBeLessThanOrEqual(320);

    const later = await text(phone, 'HELP');
    expect(later.reply).not.toMatch(/Good news/);
  });

  it('does not tell a phone about a person it marked found itself', async () => {
    const phone = '+14155550112';
    await text(phone, 'MISSING Self Found');
    const found = await text(phone, 'FOUND Self Found');
    expect(found.reply).not.toMatch(/Good news/);
    const next = await text(phone, 'HELP');
    expect(next.reply).not.toMatch(/Good news/);
  });

  it('shows initials for a child and keeps the reply within 320 characters', async () => {
    clock = Date.now() - 10 * 60 * 1000;
    const phone = '+14155550113';
    const names = ['Kid One', 'Adult Two', 'Adult Three'];
    await text(phone, 'MISSING Kid One, Rasuwa, 9');
    await text(phone, 'MISSING Adult Two, Rasuwa');
    await text(phone, 'MISSING Adult Three, Rasuwa');
    for (const name of names) {
      const [p] = await people(name);
      await markFound(ctx.db, { userId: 'web-finder', isAdmin: true }, p.id);
    }
    clock = Date.now() + 120_000;
    const { reply } = await text(phone, 'SEARCH Adult');
    expect(reply).toMatch(/^Good news: /);
    expect(reply).not.toMatch(/Kid One/);
    expect(reply.length).toBeLessThanOrEqual(320);
  });
});
