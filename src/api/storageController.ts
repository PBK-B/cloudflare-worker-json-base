// Storage Controller - Uses abstract file storage

import { ResponseBuilder, ApiError } from '../utils/response';
import { AuthMiddleware, RateLimiter, Logger } from '../utils/middleware';
import { WorkerEnv } from '../types';
import { FileStorageService } from '../storage/fileStorageService';
import { KVStorageProvider } from '../storage/providers/kvStorageProvider';
import { D1StorageProvider } from '../storage/providers/d1StorageProvider';
import { D1MetadataManager } from '../storage/metadata/metadataManager';
import { FileMetadata } from '../storage/interfaces';
import { Config } from '../utils/config';

export class StorageController {
  private storageService: FileStorageService;

  constructor(env: WorkerEnv) {
    Config.getInstance(env);
    
    const config = Config.getInstance();
    const storageBackend = config.storageBackend;
    
    const kvProvider = storageBackend === 'kv' ? new KVStorageProvider(env) : undefined;
    const d1Provider = storageBackend === 'd1' ? new D1StorageProvider(env) : undefined;
    const metadataStore = new D1MetadataManager(env);
    
    this.storageService = new FileStorageService({
      kvProvider,
      d1Provider,
      metadataStore
    });

    AuthMiddleware.initialize(env);
    RateLimiter.initialize(env);
  }

  private arrayBufferToUint8Array(buffer: ArrayBuffer): Uint8Array {
    return new Uint8Array(buffer);
  }

  private uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async upload(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace('/._jsondb_/api/storage', '') || '/';

      const auth = await AuthMiddleware.requireAuth(request);
      await RateLimiter.checkLimit(auth.apiKey, 100, 3600);

      const contentType = request.headers.get('Content-Type') || '';

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
          throw ApiError.badRequest('File is required');
        }

        if (file.size === 0) {
          throw ApiError.badRequest('File is empty');
        }

        const maxSize = 100 * 1024 * 1024; // 100MB limit
        if (file.size > maxSize) {
          throw ApiError.badRequest(`File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`);
        }

        const arrayBuffer = await file.arrayBuffer();
        const data = this.arrayBufferToUint8Array(arrayBuffer);

        const result = await this.storageService.write(data, {
          name: file.name,
          contentType: file.type || 'application/octet-stream'
        });

        if (!result.success) {
          throw ApiError.internal(result.error || 'Failed to store file');
        }

        Logger.info('File uploaded', {
          id: result.fileId,
          filename: file.name,
          size: file.size,
          auth: auth.apiKey.substring(0, 8)
        });

        return ResponseBuilder.created({
          id: result.fileId,
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          checksum: result.metadata?.checksum,
          chunkCount: result.metadata?.chunkCount,
          createdAt: result.metadata?.createdAt
        }, 'File uploaded successfully');
      }

      const body = await request.arrayBuffer();
      const data = this.arrayBufferToUint8Array(body);

      const result = await this.storageService.write(data, {
        contentType
      });

      if (!result.success) {
        throw ApiError.internal(result.error || 'Failed to store file');
      }

      Logger.info('Data uploaded', {
        id: result.fileId,
        size: data.length,
        auth: auth.apiKey.substring(0, 8)
      });

      return ResponseBuilder.created({
        id: result.fileId,
        size: data.length,
        checksum: result.metadata?.checksum,
        createdAt: result.metadata?.createdAt
      }, 'Data uploaded successfully');

    } catch (error) {
      Logger.error('Upload failed', error);
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      return ApiError.internal('Upload failed').toResponse();
    }
  }

  async download(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const id = url.pathname.replace('/._jsondb_/api/storage', '').replace(/^\//, '');

      if (!id) {
        throw ApiError.badRequest('File ID is required');
      }

      const auth = await AuthMiddleware.requireAuth(request);

      const metadata = await this.storageService.getMetadata(id);

      if (!metadata) {
        throw ApiError.notFound(`File not found: ${id}`);
      }

      const data = await this.storageService.readData(id);

      if (!data) {
        throw ApiError.notFound(`File data not found: ${id}`);
      }

      const base64 = this.uint8ArrayToBase64(data);
      const dataUrl = `data:${metadata.contentType};base64,${base64}`;

      Logger.debug('File downloaded', {
        id,
        size: metadata.size,
        auth: auth.apiKey.substring(0, 8)
      });

      return ResponseBuilder.success({
        id: metadata.id,
        name: metadata.name,
        contentType: metadata.contentType,
        size: metadata.size,
        checksum: metadata.checksum,
        data: dataUrl,
        createdAt: metadata.createdAt
      }, 'File retrieved successfully');

    } catch (error) {
      Logger.error('Download failed', error);
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      return ApiError.internal('Download failed').toResponse();
    }
  }

  async getMetadata(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const id = url.pathname.replace('/._jsondb_/api/storage', '').replace(/^\//, '');

      if (!id) {
        throw ApiError.badRequest('File ID is required');
      }

      const auth = await AuthMiddleware.requireAuth(request);

      const metadata = await this.storageService.getMetadata(id);

      if (!metadata) {
        throw ApiError.notFound(`File not found: ${id}`);
      }

      return ResponseBuilder.success(metadata, 'Metadata retrieved successfully');

    } catch (error) {
      Logger.error('Get metadata failed', error);
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      return ApiError.internal('Get metadata failed').toResponse();
    }
  }

  async delete(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const id = url.pathname.replace('/._jsondb_/api/storage', '').replace(/^\//, '');

      if (!id) {
        throw ApiError.badRequest('File ID is required');
      }

      const auth = await AuthMiddleware.requireAuth(request);
      await RateLimiter.checkLimit(auth.apiKey, 50, 3600);

      const result = await this.storageService.delete(id);

      if (!result.success) {
        throw ApiError.notFound(result.error || 'File not found');
      }

      Logger.info('File deleted', {
        id,
        auth: auth.apiKey.substring(0, 8)
      });

      return ResponseBuilder.noContent();

    } catch (error) {
      Logger.error('Delete failed', error);
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      return ApiError.internal('Delete failed').toResponse();
    }
  }

  async list(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const prefix = url.searchParams.get('prefix') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const auth = await AuthMiddleware.requireAuth(request);

      const files = await this.storageService.list({
        prefix,
        limit: Math.min(limit, 100),
        offset
      });

      const stats = await this.storageService.getStats();

      Logger.info('Files listed', {
        count: files.length,
        total: stats.totalFiles,
        auth: auth.apiKey.substring(0, 8)
      });

      return ResponseBuilder.success({
        files,
        total: stats.totalFiles,
        totalSize: stats.totalSize,
        limit,
        offset
      }, 'Files listed successfully');

    } catch (error) {
      Logger.error('List failed', error);
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      return ApiError.internal('List failed').toResponse();
    }
  }

  async verify(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const id = url.pathname.replace('/._jsondb_/api/storage', '').replace(/^\//, '');

      if (!id) {
        throw ApiError.badRequest('File ID is required');
      }

      const auth = await AuthMiddleware.requireAuth(request);

      const result = await this.storageService.verify(id);

      return ResponseBuilder.success({
        id,
        valid: result.valid,
        error: result.error
      }, result.valid ? 'File is valid' : 'File verification failed');

    } catch (error) {
      Logger.error('Verify failed', error);
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      return ApiError.internal('Verify failed').toResponse();
    }
  }
}

export default StorageController;