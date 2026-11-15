import { count, eq } from 'drizzle-orm';
import type { AppDb } from '@/db/types';
import { missingPersons } from '@/db/schema';

/** How many people in the registry are marked found ("home safe"). Records are never deleted. */
export async function countHomeSafe(db: AppDb): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(missingPersons)
    .where(eq(missingPersons.status, 'found'));
  return Number(row?.n ?? 0);
}
