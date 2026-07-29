-- Runs once on first DB container start.
-- pgvector/pgvector:pg16 ships with the vector extension pre-built;
-- we just need to enable it in the database.
CREATE EXTENSION IF NOT EXISTS vector;
