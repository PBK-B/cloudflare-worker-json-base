-- D1 Database Schema for JSON Base
-- Run: npx wrangler d1 execute jsonbase --local --file=./src/database/schema.sql

-- Drop existing tables if needed (for development)
DROP TABLE IF EXISTS data_items;
DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS path_permission_rules;

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

CREATE TABLE IF NOT EXISTS path_permission_rules (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    mode TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_path_permission_rules_priority
ON path_permission_rules(priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_path_permission_rules_enabled
ON path_permission_rules(enabled);

-- Schema migrations table
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL UNIQUE,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert initial migration
INSERT INTO schema_migrations (migration_name) VALUES ('001_create_data_items_table');
INSERT INTO schema_migrations (migration_name) VALUES ('002_create_path_permission_rules_table');
