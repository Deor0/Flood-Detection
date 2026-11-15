import { cache } from 'react';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * A fresh client per request (React `cache` scopes it to a server render; route handlers and server
 * actions get one per call), never kept across requests, for Supabase's transaction pooler (6543).
 *
 * - `max` must be > 1. With one connection, postgres-js pipelines concurrent queries on it, and
 *   through Supavisor's transaction mode a pipelined batch never answers: the page hangs. (Verified
 *   against our project: 3 concurrent queries hang with max 1, finish in ~0.3 s with max 5.) Pages
 *   run queries in parallel (e.g. /communities signed in), so give each its own connection.
 * - `prepare: false` is required by the transaction pooler.
 * - `idle_timeout` closes connections a few seconds after the request; `connect_timeout` fails fast.
 */
const connect = cache(() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, { max: 5, prepare: false, idle_timeout: 5, connect_timeout: 10 });
});

/** Lazy so that importing this module (e.g. during build) doesn't require a DB. */
export function getDb() {
  return drizzle(connect(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
