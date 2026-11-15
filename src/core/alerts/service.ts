import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Actor } from '@/core/permissions';
import { floodAlertEvents, floodAlerts } from '@/db/schema';
import { advanceAlert, type AlertStatus, type FloodAlert } from './state';

type Db = PgDatabase<PgQueryResultHKT, typeof import('@/db/schema')>;

export async function createAlert(
  db: Db,
  actor: Actor,
  input: Omit<FloodAlert, 'id' | 'status'>,
): Promise<FloodAlert> {
  const [row] = await db
    .insert(floodAlerts)
    .values({ ...input, createdByUserId: actor.userId ?? 'unknown' })
    .returning();
  await db
    .insert(floodAlertEvents)
    .values({ alertId: row.id, kind: 'detected', actorUserId: actor.userId ?? 'unknown' });
  return { ...input, id: row.id, status: 'detected' };
}

export async function advanceStoredAlert(db: Db, id: string, to: AlertStatus, actor: Actor) {
  const [row] = await db.select().from(floodAlerts).where(eq(floodAlerts.id, id)).limit(1);
  if (!row) return { ok: false as const, reason: 'not_found' as const };
  const result = advanceAlert(row, to, actor);
  if (!result.ok) return result;
  await db
    .update(floodAlerts)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(floodAlerts.id, id));
  await db.insert(floodAlertEvents).values({ alertId: id, ...result.event });
  return result;
}
