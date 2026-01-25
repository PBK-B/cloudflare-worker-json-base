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
        value = this.uint8ArrayToText(data);
        type = 'json';
      } catch {
        value = this.uint8ArrayToBase64(data);
        type = 'binary';
      }
    } else if (metadata.contentType.startsWith('text/')) {
      value = this.uint8ArrayToText(data);
      type = 'text';
    } else if (this.isBinaryContentType(metadata.contentType)) {
      value = data;
      type = 'binary';
    } else {
      value = this.uint8ArrayToText(data);
      type = 'text';
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
      contentType = request.content_type || contentType || 'text/plain';
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

    // Delete path mapping first to avoid conflict in create
    await this.pathMapper.deleteMapping(pathname);

    // Delete old data
    await this.storageService.delete(fileId);

    // Create new data
    return await this.create(pathname, request);
  }

  async upsert(pathname: string, request: {
    value: any;
    type?: 'json' | 'binary' | 'text';
    content_type?: string;
  }): Promise<StoredData> {
    await this.ensureInitialized();

    const existingFileId = await this.pathMapper.getFileId(pathname);

    if (existingFileId) {
      return await this.update(pathname, request);
    }

    return await this.create(pathname, request);
  }

  async delete(pathname: string): Promise<void> {
    await this.ensureInitialized();

    const fileId = await this.pathMapper.getFileId(pathname);

    if (!fileId) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`);
    }

    try {
      const deleteResult = await this.storageService.delete(fileId);
      if (!deleteResult.success) {
        throw new Error(deleteResult.error || 'Failed to delete from storage');
      }
    } catch (storageError) {
      Logger.error('Storage delete failed', { pathname, fileId, storageError });
      throw ApiError.internal('Failed to delete data from storage');
    }

    try {
      await this.pathMapper.deleteMapping(pathname);
    } catch (mappingError) {
      Logger.error('Path mapping delete failed', { pathname, fileId, mappingError });
      throw ApiError.internal('Failed to delete path mapping');
    }

    Logger.info('Data deleted via adapter', { pathname, fileId });
  }

  async list(params: {
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
  } = {}): Promise<{
    items: StoredData[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    await this.ensureInitialized();

    const { search, page = 1, limit = 20, sort, order = 'desc' } = params;
    const offset = (page - 1) * limit;

    let allPaths = await this.pathMapper.listPaths(100000, 0);
    let total = allPaths.length;

    const items: StoredData[] = [];

    for (const mapping of allPaths) {
      try {
        const metadata = await this.storageService.getMetadata(mapping.file_id);
        if (!metadata) {
          Logger.warn('Metadata not found for file_id', { file_id: mapping.file_id, path: mapping.path });
          continue;
        }

        Logger.debug('Found metadata', { 
          path: mapping.path, 
          file_id: mapping.file_id,
          size: metadata.size,
          contentType: metadata.contentType,
          storageBackend: metadata.storageBackend
        });

        const data = await this.storageService.readData(mapping.file_id);
        if (!data || data.length === 0) {
          Logger.warn('Data not found or empty for file_id', { file_id: mapping.file_id, path: mapping.path });
          continue;
        }

        Logger.debug('Read data', { 
          path: mapping.path, 
          dataLength: data.length,
          dataPreview: data.slice(0, 20)
        });

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

        if (search) {
          const searchLower = search.toLowerCase();
          const matchesPath = mapping.path.toLowerCase().includes(searchLower);
          const matchesValue = String(value).toLowerCase().includes(searchLower);
          if (!matchesPath && !matchesValue) {
            continue;
          }
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
      } catch (error) {
        Logger.warn('Failed to load data for path', { path: mapping.path, error });
      }
    }

    if (sort && items.length > 0) {
      items.sort((a, b) => {
        let aVal: any;
        let bVal: any;
        
        switch (sort) {
          case 'id':
            aVal = a.id.toLowerCase();
            bVal = b.id.toLowerCase();
            break;
          case 'size':
            aVal = a.size;
            bVal = b.size;
            break;
          case 'updated_at':
          default:
            aVal = new Date(a.updated_at).getTime();
            bVal = new Date(b.updated_at).getTime();
            break;
        }
        
        if (typeof aVal === 'string') {
          return order === 'asc' 
            ? aVal.localeCompare(bVal) 
            : bVal.localeCompare(aVal);
        } else {
          return order === 'asc' ? aVal - bVal : bVal - aVal;
        }
      });
    }

    total = items.length;
    const hasMore = offset + items.length < total;
    const resultItems = items.slice(offset, offset + limit);

    return {
      items: resultItems,
      total,
      page,
      limit,
      hasMore
    };
  }

  async getStats(): Promise<{ total: number; totalSize: number }> {
    await this.ensureInitialized();

    const allPaths = await this.pathMapper.listPaths(100000, 0);
    let total = 0;
    let totalSize = 0;

    for (const mapping of allPaths) {
      try {
        const metadata = await this.storageService.getMetadata(mapping.file_id);
        if (metadata) {
          total++;
          totalSize += metadata.size;
        }
      } catch {
      }
    }

    return {
      total,
      totalSize
    };
  }

  private isBinaryContentType(contentType: string): boolean {
    const binaryTypes = [
      'image/',
      'audio/',
      'video/',
      'application/pdf',
      'application/zip',
      'application/gzip',
      'application/octet-stream'
    ];
    return binaryTypes.some(type => contentType.startsWith(type));
  }
}

export default StorageAdapter;