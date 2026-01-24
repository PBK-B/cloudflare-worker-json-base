-- D1 Database Schema for JSON Base
-- Run: npx wrangler d1 execute jsonbase --local --file=./src/database/schema.sql

-- Drop existing tables if needed (for development)
DROP TABLE IF EXISTS data_items;
DROP TABLE IF EXISTS schema_migrations;

-- Create data_items table
CREATE TABLE IF NOT EXISTS data_items (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'json',
    content_type TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_data_items_updated_at ON data_items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_items_type ON data_items(type);

-- Create full-text search index on id (for prefix searches)
CREATE INDEX IF NOT EXISTS idx_data_items_id_prefix ON data_items(id);

-- Schema migrations table
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL UNIQUE,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert initial migration
INSERT INTO schema_migrations (migration_name) VALUES ('001_create_data_items_table');
