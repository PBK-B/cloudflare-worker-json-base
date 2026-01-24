import { D1Database } from '@cloudflare/workers-types';
import {
  WorkerEnv,
  CreateHybridDataRequest,
  UpdateHybridDataRequest,
  StorageMetadata,
  StorageData,
  StorageStats,
  STORAGE_LIMITS,
  isLargeFile,
  StorageLocation,
  PaginatedResponse,
  PaginationParams
} from '../types';
import { Config } from '../utils/config';
import { ApiError } from '../utils/response';
import { Logger } from '../utils/middleware';

const getD1Database = (env: WorkerEnv): D1Database | null => {
  return (env as any).JSONBASE_DB || null;
};

const getKVNamespace = (env: WorkerEnv): KVNamespace | null => {
  return (env as any).JSONBIN || null;
};

export class HybridStorageService {
  private env: WorkerEnv;
  private config: Config;
  private d1: D1Database | null;
  private kv: KVNamespace | null;

  constructor(env: WorkerEnv) {
    this.env = env;
    this.config = Config.getInstance(env);
    this.d1 = getD1Database(env);
    this.kv = getKVNamespace(env);
  }

  private async ensureD1Schema(): Promise<void> {
    if (!this.d1) {
      throw ApiError.internal('D1 database not available');
    }

    try {
      await this.d1.prepare('SELECT storage_location FROM data_items LIMIT 1').first();
    } catch {
      Logger.info('Migrating D1 schema for hybrid storage...');
      await this.d1.batch([
        this.d1.prepare('ALTER TABLE data_items ADD COLUMN storage_location TEXT DEFAULT "d1"'),
        this.d1.prepare('ALTER TABLE data_items ADD COLUMN original_name TEXT'),
        this.d1.prepare('ALTER TABLE data_items ADD COLUMN chunk_count INTEGER DEFAULT 1'),
        this.d1.prepare('ALTER TABLE data_items ADD COLUMN compression TEXT DEFAULT "none"'),
      ]);
      Logger.info('D1 schema migration completed');
    }
  }

  private async ensureKVSchema(): Promise<void> {
    if (!this.kv) {
      throw ApiError.internal('KV namespace not available');
    }

    try {
      await this.kv.get('hybrid_storage_initialized');
    } catch {
      await this.kv.put('hybrid_storage_initialized', JSON.stringify({
        version: '1.0',
        timestamp: new Date().toISOString()
      }));
      Logger.info('KV storage initialized for hybrid storage');
    }
  }

  private getKVKey(id: string, chunk: number = 0): string {
    return `data:${id}:chunk:${chunk}`;
  }

  private getKVMetadataKey(id: string): string {
    return `meta:${id}`;
  }

  private async storeInKV(id: string, value: string, metadata: Omit<StorageMetadata, 'storage_location'>): Promise<StorageMetadata> {
    if (!this.kv) {
      throw ApiError.internal('KV storage not available');
    }

    await this.ensureKVSchema();

    const size = new Blob([value]).size;

    if (size <= STORAGE_LIMITS.KV_MAX_SIZE) {
      // Single chunk storage
      await this.kv.put(this.getKVKey(id), value, {
        metadata: { ...metadata, id },
        expirationTtl: 60 * 60 * 24 * 30 // 30 days
      });
      await this.kv.put(this.getKVMetadataKey(id), JSON.stringify({
        ...metadata,
        storage_location: 'kv',
        chunk_count: 1
      }));

      return {
        ...metadata,
        storage_location: 'kv',
        chunk_count: 1
      };
    } else {
      // Chunked storage for very large data
      const chunks: string[] = [];
      const chunkSize = STORAGE_LIMITS.CHUNK_SIZE;
      let offset = 0;
      let chunkIndex = 0;

      while (offset < value.length) {
        const chunk = value.substring(offset, offset + chunkSize);
        chunks.push(chunk);
        await this.kv.put(this.getKVKey(id, chunkIndex), chunk, {
          metadata: { ...metadata, id, chunk: chunkIndex },
          expirationTtl: 60 * 60 * 24 * 30
        });
        offset += chunkSize;
        chunkIndex++;
      }

      const fullMetadata: StorageMetadata = {
        ...metadata,
        storage_location: 'kv',
        chunk_count: chunkIndex
      };

      await this.kv.put(this.getKVMetadataKey(id), JSON.stringify(fullMetadata), {
        expirationTtl: 60 * 60 * 24 * 30
      });

      Logger.debug('Data stored in KV with chunks', { id, chunkCount: chunkIndex });
      return fullMetadata;
    }
  }

  private async retrieveFromKV(id: string): Promise<string> {
    if (!this.kv) {
      throw ApiError.internal('KV storage not available');
    }

    const metadataStr = await this.kv.get(this.getKVMetadataKey(id));
    if (!metadataStr) {
      throw ApiError.notFound(`Data not found at path: ${id}`);
    }

    const metadata: StorageMetadata = JSON.parse(metadataStr as string);

    if (metadata.chunk_count === 1) {
      const value = await this.kv.get(this.getKVKey(id));
      return value as string;
    }

    // Retrieve chunks and concatenate
    const chunks: string[] = [];
    for (let i = 0; i < metadata.chunk_count!; i++) {
      const chunk = await this.kv.get(this.getKVKey(id, i));
      if (chunk) {
        chunks.push(chunk as string);
      }
    }

    return chunks.join('');
  }

  private async deleteFromKV(id: string): Promise<void> {
    if (!this.kv) {
      throw ApiError.internal('KV storage not available');
    }

    const metadataStr = await this.kv.get(this.getKVMetadataKey(id));
    if (metadataStr) {
      const metadata: StorageMetadata = JSON.parse(metadataStr as string);

      // Delete all chunks
      for (let i = 0; i < metadata.chunk_count!; i++) {
        await this.kv.delete(this.getKVKey(id, i));
      }

      // Delete metadata
      await this.kv.delete(this.getKVMetadataKey(id));
    }
  }

  async getData(pathname: string): Promise<StorageData> {
    const db = getD1Database(this.env);
    if (!db) {
      throw ApiError.internal('D1 database not available');
    }

    const result = await db
      .prepare('SELECT * FROM data_items WHERE id = ?')
      .bind(pathname)
      .first<any>();

    if (!result) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    let value: any = result.value;

    if (result.storage_location === 'kv') {
      value = await this.retrieveFromKV(pathname);
    }

    Logger.debug('Retrieved data', { pathname, storage: result.storage_location, size: result.size });
    return {
      ...result,
      value,
      storage_location: result.storage_location as StorageLocation
    };
  }

  async createData(pathname: string, request: CreateHybridDataRequest): Promise<StorageData> {
    const db = getD1Database(this.env);
    if (!db) {
      throw ApiError.internal('D1 database not available');
    }

    await this.ensureD1Schema();

    const existing = await db
      .prepare('SELECT id FROM data_items WHERE id = ?')
      .bind(pathname)
      .first();

    if (existing) {
      throw ApiError.badRequest(`Data already exists at path: ${pathname}`);
    }

    const now = new Date().toISOString();
    const type = request.type || 'json';
    let value: string = typeof request.value === 'string' ? request.value : JSON.stringify(request.value);
    let content_type: string = request.content_type || 'application/json';

    if (type === 'json') {
      value = JSON.stringify(request.value);
      content_type = request.content_type || 'application/json';
    } else if (type === 'binary') {
      if (typeof request.value === 'string' && request.value.startsWith('data:')) {
        content_type = request.content_type || request.value.split(';')[0].split(':')[1];
      } else {
        content_type = request.content_type || 'application/octet-stream';
      }
    } else {
      value = String(request.value);
      content_type = request.content_type || 'text/plain';
    }

    const size = new Blob([value]).size;
    const storageLocation: StorageLocation = isLargeFile(size) ? 'kv' : 'd1';

    const metadata: Omit<StorageMetadata, 'storage_location'> = {
      id: pathname,
      type,
      content_type,
      size,
      created_at: now,
      updated_at: now,
      original_name: request.original_name
    };

    if (storageLocation === 'kv') {
      const kvMetadata = await this.storeInKV(pathname, value, metadata);

      await db
        .prepare(
          `INSERT INTO data_items (id, value, type, content_type, size, created_at, updated_at, storage_location, original_name, chunk_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(pathname, '', type, content_type, size, now, now, 'kv', request.original_name, kvMetadata.chunk_count)
        .run();

      Logger.info('Large data stored in KV', { pathname, type, size, chunks: kvMetadata.chunk_count });
    } else {
      await db
        .prepare(
          `INSERT INTO data_items (id, value, type, content_type, size, created_at, updated_at, storage_location, original_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(pathname, value, type, content_type, size, now, now, 'd1', request.original_name)
        .run();

      Logger.info('Small data stored in D1', { pathname, type, size });
    }

    return {
      id: pathname,
      value,
      type,
      created_at: now,
      updated_at: now,
      size,
      content_type,
      storage_location: storageLocation
    };
  }

  async updateData(pathname: string, request: UpdateHybridDataRequest): Promise<StorageData> {
    const db = getD1Database(this.env);
    if (!db) {
      throw ApiError.internal('D1 database not available');
    }

    await this.ensureD1Schema();

    const existing = await db
      .prepare('SELECT * FROM data_items WHERE id = ?')
      .bind(pathname)
      .first<any>();

    if (!existing) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    // Delete old data from KV if it was there
    if (existing.storage_location === 'kv') {
      await this.deleteFromKV(pathname);
    }

    const now = new Date().toISOString();
    const type = request.type || existing.type;
    let value = request.value;
    let content_type = request.content_type || existing.content_type;

    if (type === 'json') {
      value = JSON.stringify(request.value);
      content_type = content_type || 'application/json';
    } else if (type === 'binary') {
      if (typeof request.value === 'string' && request.value.startsWith('data:')) {
        content_type = content_type || request.value.split(';')[0].split(':')[1];
      } else {
        content_type = content_type || 'application/octet-stream';
      }
    } else {
      value = String(request.value);
      content_type = content_type || 'text/plain';
    }

    const size = new Blob([value as string]).size;
    const storageLocation: StorageLocation = isLargeFile(size) ? 'kv' : 'd1';

    const metadata: Omit<StorageMetadata, 'storage_location'> = {
      id: pathname,
      type,
      content_type,
      size,
      created_at: existing.created_at,
      updated_at: now,
      original_name: existing.original_name
    };

    if (storageLocation === 'kv') {
      const kvMetadata = await this.storeInKV(pathname, value as string, metadata);

      await db
        .prepare(
          `UPDATE data_items
           SET value = ?, type = ?, content_type = ?, size = ?, updated_at = ?, storage_location = ?, chunk_count = ?
           WHERE id = ?`
        )
        .bind('', type, content_type, size, now, 'kv', kvMetadata.chunk_count, pathname)
        .run();

      Logger.info('Large data updated in KV', { pathname, type, size, chunks: kvMetadata.chunk_count });
    } else {
      await db
        .prepare(
          `UPDATE data_items
           SET value = ?, type = ?, content_type = ?, size = ?, updated_at = ?, storage_location = ?
           WHERE id = ?`
        )
        .bind(value as string, type, content_type, size, now, 'd1', pathname)
        .run();

      Logger.info('Small data updated in D1', { pathname, type, size });
    }

    return {
      id: pathname,
      value,
      type,
      created_at: existing.created_at,
      updated_at: now,
      size,
      content_type,
      storage_location: storageLocation
    };
  }

  async deleteData(pathname: string): Promise<void> {
    const db = getD1Database(this.env);
    if (!db) {
      throw ApiError.internal('D1 database not available');
    }

    const existing = await db
      .prepare('SELECT storage_location FROM data_items WHERE id = ?')
      .bind(pathname)
      .first<any>();

    if (!existing) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    // Delete from KV if it was there
    if (existing.storage_location === 'kv') {
      await this.deleteFromKV(pathname);
    }

    const result = await db
      .prepare('DELETE FROM data_items WHERE id = ?')
      .bind(pathname)
      .run();

    const deleteResult = result as unknown as { changes: number };
    if (deleteResult.changes === 0) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    Logger.info('Data deleted', { pathname, storage: existing.storage_location });
  }

  async listData(params: PaginationParams = {}): Promise<PaginatedResponse<StorageData>> {
    const db = getD1Database(this.env);
    if (!db) {
      throw ApiError.internal('D1 database not available');
    }

    const { search, page = 1, limit = 20, sort = 'updated_at', order = 'desc' } = params;
    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) as total FROM data_items';
    let sizeQuery = 'SELECT COALESCE(SUM(size), 0) as total_size FROM data_items';
    let dataQuery = 'SELECT * FROM data_items';

    const queryParams: string[] = [];
    const countParams: string[] = [];

    if (search) {
      const searchCondition = ' WHERE id LIKE ? OR value LIKE ?';
      countQuery += searchCondition;
      sizeQuery += searchCondition;
      dataQuery += searchCondition;
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern);
      countParams.push(searchPattern, searchPattern);
    }

    const sortColumn = sort === 'id' ? 'id' : 'updated_at';
    const sortOrder = order.toUpperCase();
    dataQuery += ` ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`;
    queryParams.push(limit.toString(), offset.toString());

    const [countResult, sizeResult, dataResult] = await Promise.all([
      db.prepare(countQuery).bind(...countParams).first<{ total: number }>(),
      db.prepare(sizeQuery).bind(...countParams).first<{ total_size: number }>(),
      db.prepare(dataQuery).bind(...queryParams).all<any>(),
    ]);

    const total = countResult?.total || 0;
    const totalSize = sizeResult?.total_size || 0;

    const items: StorageData[] = [];
    for (const item of (dataResult.results as any[] || [])) {
      if (item.storage_location === 'kv') {
        item.value = await this.retrieveFromKV(item.id);
      }
      items.push({
        ...item,
        storage_location: item.storage_location as StorageLocation
      });
    }

    const hasMore = offset + items.length < total;

    Logger.debug('Data listed', { total, page, limit, count: items.length, hasMore });

    return { items, total, totalSize, page, limit, hasMore };
  }

  async getStats(): Promise<StorageStats> {
    const db = getD1Database(this.env);
    if (!db) {
      throw ApiError.internal('D1 database not available');
    }

    const [totalResult, d1Result, kvResult] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as size FROM data_items').first<{ count: number, size: number }>(),
      db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as size FROM data_items WHERE storage_location = 'd1'").first<{ count: number, size: number }>(),
      db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as size FROM data_items WHERE storage_location = 'kv'").first<{ count: number, size: number }>(),
    ]);

    return {
      total_items: totalResult?.count || 0,
      d1_items: d1Result?.count || 0,
      kv_items: kvResult?.count || 0,
      total_size: totalResult?.size || 0,
      d1_size: d1Result?.size || 0,
      kv_size: kvResult?.size || 0
    };
  }

  async getHealth(): Promise<{ status: string; db: boolean; kv: boolean; timestamp: string }> {
    const dbAvailable = !!this.d1;
    const kvAvailable = !!this.kv;

    if (dbAvailable) {
      try {
        await this.d1!.prepare('SELECT 1').first();
      } catch {
        Logger.warn('D1 health check failed');
      }
    }

    if (kvAvailable) {
      try {
        await this.kv!.get('health_check');
      } catch {
        Logger.warn('KV health check failed');
      }
    }

    return {
      status: dbAvailable && kvAvailable ? 'healthy' : 'degraded',
      db: dbAvailable,
      kv: kvAvailable,
      timestamp: new Date().toISOString(),
    };
  }
}

export default HybridStorageService;