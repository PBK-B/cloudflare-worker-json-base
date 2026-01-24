// File Storage Service - Main storage abstraction layer

import {
  FileMetadata,
  ChunkStorageProvider,
  MetadataStorage,
  StorageResult,
  DEFAULT_CHUNK_SIZE,
  calculateChecksum,
  calculateChunkCount
} from './interfaces';
import { WorkerEnv } from '../types';
import { Logger } from '../utils/middleware';
import { ApiError } from '../utils/response';
import { Config } from '../utils/config';

export interface StorageConfig {
  kvProvider?: ChunkStorageProvider;
  d1Provider?: ChunkStorageProvider;
  metadataStore: MetadataStorage;
  defaultChunkSize?: number;
}

export class FileStorageService {
  private kvProvider: ChunkStorageProvider | null = null;
  private d1Provider: ChunkStorageProvider | null = null;
  private metadataStore: MetadataStorage;
  private chunkSize: number;
  private storageBackend: 'kv' | 'd1' = 'kv';

  constructor(config: StorageConfig) {
    this.kvProvider = config.kvProvider || null;
    this.d1Provider = config.d1Provider || null;
    this.metadataStore = config.metadataStore;
    this.chunkSize = config.defaultChunkSize || DEFAULT_CHUNK_SIZE;

    try {
      const cfg = Config.getInstance();
      this.storageBackend = cfg.storageBackend;
    } catch {
      this.storageBackend = 'kv';
    }

    Logger.info('FileStorageService initialized', { storageBackend: this.storageBackend });
  }

  private getProvider(): ChunkStorageProvider {
    switch (this.storageBackend) {
      case 'd1':
        if (!this.d1Provider) {
          throw ApiError.serviceUnavailable('D1 storage provider not available. Set STORAGE_BACKEND=kv to use KV storage.');
        }
        return this.d1Provider;
      case 'kv':
      default:
        if (!this.kvProvider) {
          throw ApiError.serviceUnavailable('KV storage provider not available. Set STORAGE_BACKEND=d1 to use D1 storage.');
        }
        return this.kvProvider;
    }
  }

  async write(data: Uint8Array, options: {
    name?: string;
    contentType?: string;
  } = {}): Promise<StorageResult> {
    try {
      const id = this.generateId();
      const checksum = await calculateChecksum(data);
      const now = new Date().toISOString();
      const provider = this.getProvider();

      const metadata: FileMetadata = {
        id,
        name: options.name,
        contentType: options.contentType || 'application/octet-stream',
        size: data.length,
        createdAt: now,
        updatedAt: now,
        checksum,
        chunkCount: calculateChunkCount(data.length, this.chunkSize),
        chunkSize: this.chunkSize,
        storageBackend: provider.getBackendName()
      };

      await provider.write(data, metadata);

      await this.metadataStore.save(metadata);

      Logger.info('File stored successfully', {
        id,
        size: data.length,
        chunks: metadata.chunkCount,
        backend: metadata.storageBackend,
        storageBackend: this.storageBackend
      });

      return {
        success: true,
        fileId: id,
        metadata
      };
    } catch (error) {
      Logger.error('Failed to store file', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async read(id: string): Promise<StorageResult> {
    try {
      const metadata = await this.metadataStore.load(id);

      if (!metadata) {
        throw ApiError.notFound(`File not found: ${id}`);
      }

      const provider = metadata.storageBackend === 'd1' ? this.d1Provider : this.kvProvider;
      
      if (!provider) {
        throw ApiError.serviceUnavailable(`${metadata.storageBackend.toUpperCase()} storage provider not available`);
      }

      const data = await provider.read(metadata.id);

      const calculatedChecksum = await calculateChecksum(data);
      if (calculatedChecksum !== metadata.checksum) {
        throw new Error('File checksum mismatch - data may be corrupted');
      }

      Logger.debug('File read successfully', { id, size: data.length });

      return {
        success: true,
        fileId: id,
        metadata
      };
    } catch (error) {
      Logger.error('Failed to read file', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async readData(id: string): Promise<Uint8Array | null> {
    try {
      const metadata = await this.metadataStore.load(id);

      if (!metadata) {
        return null;
      }

      const provider = metadata.storageBackend === 'd1' ? this.d1Provider : this.kvProvider;
      
      if (!provider) {
        return null;
      }

      const data = await provider.read(metadata.id);
      return data;
    } catch (error) {
      Logger.error('Failed to read file data', error);
      return null;
    }
  }

  async delete(id: string): Promise<StorageResult> {
    try {
      const metadata = await this.metadataStore.load(id);

      if (!metadata) {
        throw ApiError.notFound(`File not found: ${id}`);
      }

      const provider = metadata.storageBackend === 'd1' ? this.d1Provider : this.kvProvider;
      
      if (!provider) {
        throw ApiError.serviceUnavailable(`${metadata.storageBackend.toUpperCase()} storage provider not available`);
      }

      await provider.delete(metadata.id);

      await this.metadataStore.delete(id);

      Logger.info('File deleted successfully', { id });

      return {
        success: true,
        fileId: id
      };
    } catch (error) {
      Logger.error('Failed to delete file', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async exists(id: string): Promise<boolean> {
    const metadata = await this.metadataStore.load(id);
    return metadata !== null;
  }

  async getMetadata(id: string): Promise<FileMetadata | null> {
    return await this.metadataStore.load(id);
  }

  async list(options: {
    prefix?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<FileMetadata[]> {
    return await this.metadataStore.list(
      options.prefix,
      options.limit || 20,
      options.offset || 0
    );
  }

  async getStats(): Promise<{ totalFiles: number; totalSize: number }> {
    return await this.metadataStore.getStats();
  }

  async verify(id: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const metadata = await this.metadataStore.load(id);

      if (!metadata) {
        return { valid: false, error: 'File not found' };
      }

      const provider = metadata.storageBackend === 'd1' ? this.d1Provider : this.kvProvider;
      
      if (!provider) {
        return { valid: false, error: `${metadata.storageBackend.toUpperCase()} storage provider not available` };
      }

      const data = await provider.read(metadata.id);

      if (data.length !== metadata.size) {
        return { valid: false, error: 'File size mismatch' };
      }

      const checksum = await calculateChecksum(data);
      if (checksum !== metadata.checksum) {
        return { valid: false, error: 'Checksum verification failed' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  private generateId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return `file_${Date.now()}_${hex}`;
  }
}

export default FileStorageService;