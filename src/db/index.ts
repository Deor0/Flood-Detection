import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Serverless: each instance holds at most one connection and drops it when idle, so many
  // instances fit in Supabase's pooler. `prepare: false` is required by the transaction pooler
  // (port 6543) and harmless elsewhere.
  return (globalForDb.pg ??= postgres(url, { max: 1, idle_timeout: 20, prepare: false }));
}

/** Lazy so that importing this module (e.g. during build) doesn't require a DB. */
export function getDb() {
  return drizzle(client(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
