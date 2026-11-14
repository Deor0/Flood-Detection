import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return (globalForDb.pg ??= postgres(url));
}

/** Lazy so that importing this module (e.g. during build) doesn't require a DB. */
export function getDb() {
  return drizzle(client(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
