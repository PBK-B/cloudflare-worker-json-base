-- D1 schema for the new monorepo API mainline
-- Run with: wrangler d1 execute <binding-or-name> --remote --file=apps/api/database/schema.sql

CREATE TABLE IF NOT EXISTS resources (
    path TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resources_updated_at ON resources(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_size ON resources(size);
CREATE INDEX IF NOT EXISTS idx_resources_path ON resources(path);

CREATE TABLE IF NOT EXISTS permission_rules (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    mode TEXT NOT NULL,
    priority INTEGER NOT NULL,
    enabled INTEGER NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permission_rules_priority
    ON permission_rules(priority DESC, updated_at DESC, created_at DESC);
