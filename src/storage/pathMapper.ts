// Path Mapping Layer - Maps path-based IDs to file storage

import { D1Database } from '@cloudflare/workers-types';
import { WorkerEnv } from '../types';
import { Logger } from '../utils/middleware';
import { ApiError } from '../utils/response';

interface PathMapping {
  path: string;
  file_id: string;
  created_at: string;
}

export class PathMapper {
  private db: D1Database | null;

  constructor(env: WorkerEnv) {
    this.db = (env as any).JSONBASE_DB || null;
  }

  async initialize(): Promise<void> {
    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS path_mappings (
        path TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();
  }

  async getFileId(path: string): Promise<string | null> {
    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }

    try {
      const result = await this.db.prepare(`
        SELECT file_id FROM path_mappings WHERE path = ?
      `).bind(path).first() as { file_id: string } | null;

      return result?.file_id || null;
    } catch (error) {
      Logger.error('Failed to get file id', error);
      throw ApiError.internal('Database operation failed');
    }
  }

  async setMapping(path: string, fileId: string): Promise<void> {
    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }

    const now = new Date().toISOString();

    await this.db.prepare(`
      INSERT OR REPLACE INTO path_mappings (path, file_id, created_at)
      VALUES (?, ?, ?)
    `).bind(path, fileId, now).run();

    Logger.debug('Path mapping created', { path, fileId });
  }

  async deleteMapping(path: string): Promise<void> {
    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }

    await this.db.prepare(`
      DELETE FROM path_mappings WHERE path = ?
    `).bind(path).run();
  }

  async getPath(fileId: string): Promise<string | null> {
    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }

    const result = await this.db.prepare(`
      SELECT path FROM path_mappings WHERE file_id = ?
    `).bind(fileId).first() as { path: string } | null;

    return result?.path || null;
  }

  async listPaths(limit: number = 20, offset: number = 0): Promise<PathMapping[]> {
    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }

    const result = await this.db.prepare(`
      SELECT * FROM path_mappings ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).bind(limit, offset).all() as { results: PathMapping[] };

    return result.results || [];
  }

  async getTotalPaths(): Promise<number> {
    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }

    const result = await this.db.prepare(`
      SELECT COUNT(*) as count FROM path_mappings
    `).first() as { count: number } | null;

    return result?.count ?? 0;
  }
}

export default PathMapper;