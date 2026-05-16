-- Add PostGIS geography column to merchants for geo queries
-- This column is maintained by the application (set on create/update)

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

-- Populate location from existing lat/lng
UPDATE merchants SET location = ST_MakePoint(longitude::float8, latitude::float8)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- GIST index for ST_DWithin queries
CREATE INDEX IF NOT EXISTS merchants_location_idx ON merchants USING GIST(location);

-- Trigram index for fast ILIKE search on business_name
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS merchants_business_name_trgm_idx ON merchants USING GIN (business_name gin_trgm_ops);
