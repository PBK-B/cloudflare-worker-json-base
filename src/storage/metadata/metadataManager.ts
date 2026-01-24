// Metadata Manager - Stores file metadata in D1

import { D1Database } from '@cloudflare/workers-types';
import {
  MetadataStorage,
  FileMetadata
} from '../interfaces';
import { WorkerEnv } from '../../types';
import { Logger } from '../../utils/middleware';
import { ApiError } from '../../utils/response';

export class D1MetadataManager implements MetadataStorage {
  private db: D1Database;

  constructor(env: WorkerEnv) {
    this.db = (env as any).JSONBASE_DB || null;

    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available');
    }
  }

  async initialize(): Promise<void> {
    // Create table if not exists using prepare/run
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS file_metadata (
        id TEXT PRIMARY KEY,
        name TEXT,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        checksum TEXT NOT NULL,
        chunk_count INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        storage_backend TEXT NOT NULL,
        handle TEXT NOT NULL
      )
    `).run();

    // Create path_mappings table if not exists
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS path_mappings (
        path TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    // Create indexes
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_file_metadata_created_at ON file_metadata(created_at DESC)
    `).run();

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_file_metadata_storage_backend ON file_metadata(storage_backend)
    `).run();
  }

  async save(metadata: FileMetadata): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO file_metadata
      (id, name, content_type, size, created_at, updated_at, checksum, chunk_count, chunk_size, storage_backend, handle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      metadata.id,
      metadata.name ?? null,
      metadata.contentType,
      metadata.size,
      metadata.createdAt,
      metadata.updatedAt,
      metadata.checksum,
      metadata.chunkCount,
      metadata.chunkSize,
      metadata.storageBackend,
      metadata.id
    ).run();

    Logger.debug('Metadata saved', { id: metadata.id, size: metadata.size });
  }

  async load(id: string): Promise<FileMetadata | null> {
    const result = await this.db.prepare(`
      SELECT * FROM file_metadata WHERE id = ?
    `).bind(id).first();

    if (!result) {
      return null;
    }

    return this.rowToMetadata(result);
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.prepare(`
      DELETE FROM file_metadata WHERE id = ?
    `).bind(id).run();

    if ((result as any).changes === 0) {
      throw ApiError.notFound(`File metadata not found: ${id}`);
    }

    Logger.debug('Metadata deleted', { id });
  }

  async list(prefix?: string, limit: number = 20, offset: number = 0): Promise<FileMetadata[]> {
    let query = 'SELECT * FROM file_metadata';
    const params: string[] = [];

    if (prefix) {
      query += ' WHERE id LIKE ?';
      params.push(`${prefix}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit.toString(), offset.toString());

    const result = await this.db.prepare(query).bind(...params).all();

    return (result.results as any[]).map(row => this.rowToMetadata(row));
  }

  async getStats(): Promise<{ totalFiles: number; totalSize: number }> {
    try {
      const result = await this.db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
        FROM file_metadata
      `).first();

      const count = (result as any)?.count ?? 0;
      const total_size = (result as any)?.total_size ?? 0;

      return {
        totalFiles: count,
        totalSize: total_size
      };
    } catch (error) {
      console.error('getStats error:', error);
      throw error;
    }
  }

  private rowToMetadata(row: any): FileMetadata {
    return {
      id: row.id,
      name: row.name ?? null,
      contentType: row.content_type,
      size: row.size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      checksum: row.checksum,
      chunkCount: row.chunk_count,
      chunkSize: row.chunk_size,
      storageBackend: row.storage_backend
    };
  }
}

export default D1MetadataManager;