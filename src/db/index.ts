import { cache } from 'react';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * One fresh connection per request (React `cache` scopes it to a server render; route handlers and
 * server actions get one per call). We never keep a connection alive across requests: on Vercel an
 * idle instance is frozen, the pooler drops its socket, and a reused dead socket hangs every later
 * query on that instance. Supabase's transaction pooler (port 6543) makes new connections cheap.
 * `prepare: false` is required by the transaction pooler; `idle_timeout` closes the connection a
 * few seconds after the request is done; `connect_timeout` fails fast instead of hanging.
 */
const connect = cache(() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10 });
});

/** Lazy so that importing this module (e.g. during build) doesn't require a DB. */
export function getDb() {
  return drizzle(connect(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
