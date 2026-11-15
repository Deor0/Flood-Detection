-- Custom SQL migration file, put your code below! --
-- The app reads and writes through DATABASE_URL as `postgres` (bypasses RLS) and never uses
-- Supabase's Data API (REST/GraphQL). Supabase grants its API roles `anon` and `authenticated`
-- full rights on every table in `public` by default, which made all records readable and
-- deletable with the public key. Remove those rights, also for tables created later. Guarded so
-- databases without these roles (the PGlite test database) skip it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
