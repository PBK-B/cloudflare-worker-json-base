// Storage Adapter - Combines FileStorageService with PathMapper for path-based API

import { FileStorageService } from './fileStorageService';
import { PathMapper } from './pathMapper';
import { WorkerEnv } from '../types';
import { Logger } from '../utils/middleware';
import { ApiError } from '../utils/response';
import { FileMetadata } from './interfaces';
import { KVStorageProvider } from './providers/kvStorageProvider';
import { D1StorageProvider } from './providers/d1StorageProvider';
import { D1MetadataManager } from './metadata/metadataManager';
import { Config } from '../utils/config';

interface PathMapping {
  path: string;
  file_id: string;
  created_at: string;
}

export interface StorageAdapterConfig {
  env: WorkerEnv;
  defaultContentType?: string;
}

export interface StoredData {
  id: string;
  value: any;
  type: 'json' | 'binary' | 'text';
  created_at: string;
  updated_at: string;
  size: number;
  content_type?: string;
  path?: string;
  storage_location?: 'd1' | 'kv';
}

export class StorageAdapter {
  private storageService!: FileStorageService;
  private pathMapper!: PathMapper;
  private defaultContentType: string;
  private initialized: boolean = false;
  private env: WorkerEnv;

  constructor(config: StorageAdapterConfig) {
    this.defaultContentType = config.defaultContentType || 'application/json';
    this.env = config.env;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!(globalThis as any).ENV) {
      (globalThis as any).ENV = this.env;
    }

    const env = (globalThis as any).ENV;
    
    const config = Config.getInstance(env);
    const storageBackend = config.storageBackend;
    
    const kvProvider = storageBackend === 'kv' ? new KVStorageProvider(env) : undefined;
    const d1Provider = storageBackend === 'd1' ? new D1StorageProvider(env) : undefined;
    const metadataStore = new D1MetadataManager(env);

    this.storageService = new FileStorageService({
      kvProvider,
      d1Provider,
      metadataStore
    });

    await metadataStore.initialize();
    if (d1Provider) {
      await d1Provider.initialize();
    }
    this.pathMapper = new PathMapper(env);
    await this.pathMapper.initialize();

    this.initialized = true;
  }

  private textToUint8Array(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  private uint8ArrayToText(data: Uint8Array): string {
    return new TextDecoder().decode(data);
  }

  private uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  async get(pathname: string): Promise<StoredData> {
    await this.ensureInitialized();

    const fileId = await this.pathMapper.getFileId(pathname);

    if (!fileId) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    const data = await this.storageService.readData(fileId);
    const metadata = await this.storageService.getMetadata(fileId);

    if (!data || !metadata) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    let value: any;
    let type: 'json' | 'binary' | 'text' = 'text';

    if (metadata.contentType === 'application/json') {
      try {
        value = JSON.parse(this.uint8ArrayToText(data));
        type = 'json';
      } catch {
        value = this.uint8ArrayToBase64(data);
        type = 'binary';
      }
    } else if (metadata.contentType.startsWith('text/')) {
      value = this.uint8ArrayToText(data);
      type = 'text';
    } else {
      value = this.uint8ArrayToBase64(data);
      type = 'binary';
    }

    return {
      id: pathname,
      value,
      type,
      created_at: metadata.createdAt,
      updated_at: metadata.updatedAt,
      size: metadata.size,
      content_type: metadata.contentType,
      path: pathname,
      storage_location: (metadata.storageBackend === 'd1' || metadata.storageBackend === 'kv') 
        ? metadata.storageBackend 
        : 'd1' as 'd1' | 'kv'
    };
  }

  async create(pathname: string, request: {
    value: any;
    type?: 'json' | 'binary' | 'text';
    content_type?: string;
  }): Promise<StoredData> {
    console.log('StorageAdapter.create called:', { pathname, value: request.value, type: request.type });
    await this.ensureInitialized();

    const existingFileId = await this.pathMapper.getFileId(pathname);
    if (existingFileId) {
      throw ApiError.badRequest(`Data already exists at path: ${pathname}`);
    }

    const type = request.type || 'json';
    let contentType = request.content_type || this.defaultContentType;
    let data: Uint8Array;

    if (type === 'json') {
      const jsonString = typeof request.value === 'string' ? request.value : JSON.stringify(request.value);
      data = this.textToUint8Array(jsonString);
      contentType = 'application/json';
    } else if (type === 'binary') {
      if (typeof request.value === 'string' && request.value.startsWith('data:')) {
        const base64 = request.value.split(',')[1];
        const binaryString = atob(base64);
        data = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          data[i] = binaryString.charCodeAt(i);
        }
        contentType = request.content_type || request.value.split(';')[0].split(':')[1];
      } else {
        data = this.textToUint8Array(String(request.value));
      }
    } else {
      data = this.textToUint8Array(String(request.value));
      contentType = 'text/plain';
    }

    const result = await this.storageService.write(data, {
      name: pathname,
      contentType
    });

    if (!result.success || !result.fileId) {
      throw ApiError.internal(result.error || 'Failed to store data');
    }

    await this.pathMapper.setMapping(pathname, result.fileId);

    Logger.info('Data created via adapter', {
      pathname,
      fileId: result.fileId,
      size: data.length,
      type,
      storageBackend: result.metadata?.storageBackend,
      auth: 'system'
    });

    return {
      id: pathname,
      value: request.value,
      type,
      created_at: result.metadata!.createdAt,
      updated_at: result.metadata!.updatedAt,
      size: data.length,
      content_type: contentType,
      path: pathname,
      storage_location: result.metadata?.storageBackend === 'd1' || result.metadata?.storageBackend === 'kv' 
        ? result.metadata.storageBackend 
        : 'd1' as 'd1' | 'kv'
    };
  }

  async update(pathname: string, request: {
    value: any;
    type?: 'json' | 'binary' | 'text';
    content_type?: string;
  }): Promise<StoredData> {
    await this.ensureInitialized();

    const fileId = await this.pathMapper.getFileId(pathname);

    if (!fileId) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    // Delete old data
    await this.storageService.delete(fileId);

    // Create new data
    return await this.create(pathname, request);
  }

  async delete(pathname: string): Promise<void> {
    await this.ensureInitialized();

    const fileId = await this.pathMapper.getFileId(pathname);

    if (!fileId) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    // Delete from storage
    await this.storageService.delete(fileId);

    // Delete path mapping
    await this.pathMapper.deleteMapping(pathname);

    Logger.info('Data deleted via adapter', { pathname, fileId });
  }

  async list(params: {
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    items: StoredData[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    await this.ensureInitialized();

    const { search, page = 1, limit = 20 } = params;
    const offset = (page - 1) * limit;

    if (search) {
      const allPaths = await this.pathMapper.listPaths(100000, 0);
      const searchLower = search.toLowerCase();
      const matchedMappings: Array<{ mapping: PathMapping; metadata: FileMetadata; data: Uint8Array }> = [];

      for (const mapping of allPaths) {
        try {
          const data = await this.storageService.readData(mapping.file_id);
          const metadata = await this.storageService.getMetadata(mapping.file_id);
          if (data && metadata) {
            let value: any;
            if (metadata.contentType === 'application/json') {
              try {
                value = JSON.parse(this.uint8ArrayToText(data));
              } catch {
                value = '[Binary data]';
              }
            } else {
              value = this.uint8ArrayToText(data).substring(0, 100);
            }
            const matchesPath = mapping.path.toLowerCase().includes(searchLower);
            const matchesValue = String(value).toLowerCase().includes(searchLower);
            if (matchesPath || matchesValue) {
              matchedMappings.push({ mapping, metadata, data });
            }
          }
        } catch (error) {
          Logger.warn('Failed to load data for path', { path: mapping.path, error });
        }
      }

      const total = matchedMappings.length;
      const pageMappings = matchedMappings.slice(offset, offset + limit);

      const items: StoredData[] = pageMappings.map(({ mapping, metadata, data }) => {
        let value: any;
        let type: 'json' | 'binary' | 'text' = 'text';
        if (metadata.contentType === 'application/json') {
          try {
            value = JSON.parse(this.uint8ArrayToText(data));
            type = 'json';
          } catch {
            value = '[Binary data]';
            type = 'binary';
          }
        } else if (metadata.contentType.startsWith('text/')) {
          value = this.uint8ArrayToText(data).substring(0, 100);
          type = 'text';
        } else {
          value = '[Binary data]';
          type = 'binary';
        }
        return {
          id: mapping.path,
          value,
          type,
          created_at: metadata.createdAt,
          updated_at: metadata.updatedAt,
          size: metadata.size,
          content_type: metadata.contentType,
          path: mapping.path,
          storage_location: (metadata.storageBackend === 'd1' || metadata.storageBackend === 'kv') 
            ? metadata.storageBackend 
            : 'd1' as 'd1' | 'kv'
        };
      });

      const hasMore = offset + items.length < total;

      return {
        items,
        total,
        page,
        limit,
        hasMore
      };
    }

    const paths = await this.pathMapper.listPaths(limit, offset);
    const total = await this.pathMapper.getTotalPaths();

    const items: StoredData[] = [];

    for (const mapping of paths) {
      try {
        const data = await this.storageService.readData(mapping.file_id);
        const metadata = await this.storageService.getMetadata(mapping.file_id);

        if (data && metadata) {
          let value: any;
          let type: 'json' | 'binary' | 'text' = 'text';
          if (metadata.contentType === 'application/json') {
            try {
              value = JSON.parse(this.uint8ArrayToText(data));
              type = 'json';
            } catch {
              value = '[Binary data]';
              type = 'binary';
            }
          } else if (metadata.contentType.startsWith('text/')) {
            value = this.uint8ArrayToText(data).substring(0, 100);
            type = 'text';
          } else {
            value = '[Binary data]';
            type = 'binary';
          }
          items.push({
            id: mapping.path,
            value,
            type,
            created_at: metadata.createdAt,
            updated_at: metadata.updatedAt,
            size: metadata.size,
            content_type: metadata.contentType,
            path: mapping.path,
            storage_location: (metadata.storageBackend === 'd1' || metadata.storageBackend === 'kv') 
              ? metadata.storageBackend 
              : 'd1' as 'd1' | 'kv'
          });
        }
      } catch (error) {
        Logger.warn('Failed to load data for path', { path: mapping.path, error });
      }
    }

    const hasMore = offset + items.length < total;

    return {
      items,
      total,
      page,
      limit,
      hasMore
    };
  }

  async getStats(): Promise<{ total: number; totalSize: number }> {
    await this.ensureInitialized();

    const stats = await this.storageService.getStats();
    const totalPaths = await this.pathMapper.getTotalPaths();

    return {
      total: totalPaths,
      totalSize: stats.totalSize
    };
  }
}

export default StorageAdapter;