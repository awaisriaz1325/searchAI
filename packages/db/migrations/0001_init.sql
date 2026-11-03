-- Extensions available on Supabase as well.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Supabase-style roles and auth.uid().
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TYPE portal AS ENUM ('cars', 'homes', 'rentals', 'jobs', 'marketplace');

-- Text-search configuration per listing language (IMMUTABLE so it can feed a generated column).
CREATE OR REPLACE FUNCTION fts_config(lang text) RETURNS regconfig LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE lang
    WHEN 'de' THEN 'german'::regconfig
    WHEN 'en' THEN 'english'::regconfig
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    ELSE 'simple'::regconfig
  END $$;

CREATE TABLE listings (
  id           bigint PRIMARY KEY,
  portal       portal NOT NULL,
  owner_id     uuid NOT NULL,
  status       text NOT NULL CHECK (status IN ('draft', 'published')),
  title        text NOT NULL,
  description  text NOT NULL,
  lang         text NOT NULL,
  price_minor  bigint NOT NULL,
  currency     char(3) NOT NULL DEFAULT 'EUR',
  lat          double precision NOT NULL,
  lon          double precision NOT NULL,
  facts        jsonb NOT NULL,
  facts_source text NOT NULL CHECK (facts_source IN ('truth', 'extracted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector(fts_config(lang), title), 'A')
    || setweight(to_tsvector(fts_config(lang), description), 'B')
    || to_tsvector('simple'::regconfig, title)
  ) STORED
);

CREATE TABLE listing_embeddings (
  listing_id    bigint PRIMARY KEY REFERENCES listings (id) ON DELETE CASCADE,
  model         text NOT NULL,
  model_version text NOT NULL,
  embedding     halfvec(384) NOT NULL,
  embedded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE places (
  name_norm text PRIMARY KEY,
  lat       double precision NOT NULL,
  lon       double precision NOT NULL,
  country   char(2) NOT NULL
);

CREATE INDEX listings_portal_status_price ON listings (portal, status, price_minor);
CREATE INDEX listings_cars_hot ON listings ((facts->>'fuel'), (facts->>'body'), ((facts->>'mileage_km')::int))
  WHERE portal = 'cars';
CREATE INDEX listings_facts_gin ON listings USING gin (facts jsonb_path_ops);
CREATE INDEX listings_fts_gin ON listings USING gin (fts);
CREATE INDEX listings_geo ON listings USING gist (ll_to_earth(lat, lon));
CREATE INDEX listings_title_trgm ON listings USING gin (title gin_trgm_ops);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY listings_anon_read ON listings FOR SELECT TO anon USING (status = 'published');
CREATE POLICY listings_auth_read ON listings FOR SELECT TO authenticated
  USING (status = 'published' OR owner_id = auth.uid());
CREATE POLICY embeddings_read ON listing_embeddings FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id));

GRANT SELECT ON listings, listing_embeddings, places TO anon, authenticated;
