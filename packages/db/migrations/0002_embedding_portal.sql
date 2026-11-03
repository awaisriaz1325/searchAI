-- Copy the portal onto each embedding so every portal gets its own partial HNSW index:
-- a cars query never walks a graph full of job ads it would filter out afterwards.
ALTER TABLE listing_embeddings ADD COLUMN portal portal;
UPDATE listing_embeddings e SET portal = l.portal FROM listings l WHERE l.id = e.listing_id;
ALTER TABLE listing_embeddings ALTER COLUMN portal SET NOT NULL;
CREATE INDEX listing_embeddings_model_version ON listing_embeddings (model_version);
