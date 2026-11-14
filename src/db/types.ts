import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

/** Works with the postgres-js client (app) and PGlite (tests). */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;
