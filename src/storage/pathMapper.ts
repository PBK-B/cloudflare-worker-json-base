import { D1Database } from '@cloudflare/workers-types';
import { WorkerEnv } from '../types';
import { Logger } from '../utils/middleware';
import { SystemDataAdapter } from '../system/systemDataAdapter';
import {
  getPathMappingRecordPath,
  PATH_MAPPINGS_INDEX_PATH,
} from '../system/systemPaths';

export interface PathMapping {
  path: string;
  file_id: string;
  created_at: string;
}

interface PathMappingIndex {
  version: number;
  updatedAt: string;
  items: PathMapping[];
}

interface LegacyPathMappingRow {
  path: string;
  file_id: string;
  created_at: string;
}

export class PathMapper {
  private adapter: SystemDataAdapter;
  private db: D1Database | null;
  private initialized = false;

  constructor(env: WorkerEnv, adapter?: SystemDataAdapter) {
    this.adapter = adapter || new SystemDataAdapter(env);
    this.db = (env as any).JSONBASE_DB || null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const existingIndex = await this.adapter.getJson<PathMappingIndex>(PATH_MAPPINGS_INDEX_PATH);
    if (!existingIndex) {
      await this.migrateLegacyMappingsIfNeeded();

      const reloadedIndex = await this.adapter.getJson<PathMappingIndex>(PATH_MAPPINGS_INDEX_PATH);
      if (!reloadedIndex) {
        await this.writeIndex(this.createEmptyIndex());
      }
    }

    this.initialized = true;
  }

  async getFileId(path: string): Promise<string | null> {
    await this.initialize();

    const index = await this.loadIndex();
    const mapping = index.items.find((item) => item.path === path);
    if (mapping) {
      return mapping.file_id;
    }

    const record = await this.adapter.getJson<PathMapping>(getPathMappingRecordPath(this.encodePath(path)));
    return record?.file_id || null;
  }

  async setMapping(path: string, fileId: string): Promise<void> {
    await this.initialize();

    const now = new Date().toISOString();
    const mapping: PathMapping = {
      path,
      file_id: fileId,
      created_at: now,
    };

    await this.adapter.setJson(getPathMappingRecordPath(this.encodePath(path)), mapping);

    const index = await this.loadIndex();
    const nextItems = index.items.filter((item) => item.path !== path);
    nextItems.push(mapping);
    index.items = this.sortMappings(nextItems);
    index.updatedAt = now;
    await this.writeIndex(index);

    Logger.debug('Path mapping created', { path, fileId });
  }

  async deleteMapping(path: string): Promise<void> {
    await this.initialize();

    await this.adapter.delete(getPathMappingRecordPath(this.encodePath(path)));

    const index = await this.loadIndex();
    index.items = index.items.filter((item) => item.path !== path);
    index.updatedAt = new Date().toISOString();
    await this.writeIndex(index);
  }

  async getPath(fileId: string): Promise<string | null> {
    await this.initialize();

    const index = await this.loadIndex();
    const mapping = index.items.find((item) => item.file_id === fileId);
    return mapping?.path || null;
  }

  async listPaths(limit: number = 20, offset: number = 0): Promise<PathMapping[]> {
    await this.initialize();

    const index = await this.loadIndex();
    return this.sortMappings(index.items).slice(offset, offset + limit);
  }

  async getTotalPaths(): Promise<number> {
    await this.initialize();
    const index = await this.loadIndex();
    return index.items.length;
  }

  private async loadIndex(): Promise<PathMappingIndex> {
    const index = await this.adapter.getJson<PathMappingIndex>(PATH_MAPPINGS_INDEX_PATH);
    return index || this.createEmptyIndex();
  }

  private async writeIndex(index: PathMappingIndex): Promise<void> {
    await this.adapter.setJson(PATH_MAPPINGS_INDEX_PATH, {
      ...index,
      items: this.sortMappings(index.items),
    });
  }

  private createEmptyIndex(): PathMappingIndex {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }

  private sortMappings(mappings: PathMapping[]): PathMapping[] {
    return [...mappings].sort((left, right) => {
      const createdDiff = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      if (createdDiff !== 0) {
        return createdDiff;
      }

      return left.path.localeCompare(right.path);
    });
  }

  private encodePath(path: string): string {
    return encodeURIComponent(path);
  }

  private async migrateLegacyMappingsIfNeeded(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const result = await this.db.prepare(`
        SELECT * FROM path_mappings ORDER BY created_at DESC
      `).all() as { results?: LegacyPathMappingRow[] };

      const legacyMappings = (result.results || []).map((row) => ({
        path: row.path,
        file_id: row.file_id,
        created_at: row.created_at,
      }));

      if (legacyMappings.length === 0) {
        return;
      }

      for (const mapping of legacyMappings) {
        await this.adapter.setJson(getPathMappingRecordPath(this.encodePath(mapping.path)), mapping);
      }

      await this.writeIndex({
        version: 1,
        updatedAt: new Date().toISOString(),
        items: legacyMappings,
      });
    } catch (error) {
      Logger.warn('Legacy path mapping migration skipped', { error });
    }
  }
}

export default PathMapper;
