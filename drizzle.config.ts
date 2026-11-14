import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not load .env by itself (Next.js does for the app).
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file: rely on the real environment
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
