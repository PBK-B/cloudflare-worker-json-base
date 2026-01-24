import { WorkerEnv } from '../types';
import { FileStorageService } from '../storage/fileStorageService';
import { KVStorageProvider } from '../storage/providers/kvStorageProvider';
import { D1StorageProvider } from '../storage/providers/d1StorageProvider';
import { D1MetadataManager } from '../storage/metadata/metadataManager';
import { PathMapper } from '../storage/pathMapper';
import { Config } from '../utils/config';
import { ApiError } from '../utils/response';
import { AuthMiddleware, Logger } from '../utils/middleware';

export class DataAccessController {
  private storageService: FileStorageService;
  private pathMapper: PathMapper;

  constructor(env: WorkerEnv) {
    Config.getInstance(env);
    AuthMiddleware.initialize(env);
    
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

    this.pathMapper = new PathMapper(env);
  }

  async handle(request: Request): Promise<Response | null> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      const isApiPath = pathname.startsWith('/._jsondb_/') || 
                        pathname === '/' ||
                        pathname.startsWith('/assets/') ||
                        pathname.startsWith('/vite.svg');

      if (isApiPath) {
        return null;
      }

      await AuthMiddleware.authenticate(request);

      await this.pathMapper.initialize();

      const fileId = await this.pathMapper.getFileId(pathname);
      
      if (!fileId) {
        return new Response('Not Found', { status: 404 });
      }

      const metadata = await this.storageService.getMetadata(fileId);
      
      if (!metadata) {
        throw ApiError.notFound('File metadata not found');
      }

      const data = await this.storageService.readData(fileId);
      
      if (!data || data.length === 0) {
        throw ApiError.notFound('File data not found');
      }

      const contentType = metadata.contentType;
      const isTextContent = this.isTextContent(contentType);
      const shouldDownload = !isTextContent && this.isDownloadable(contentType);

      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      };

      if (isTextContent) {
        responseHeaders['Type'] = contentType;
      }

      if (shouldDownload && metadata.name) {
        responseHeaders['Content-Disposition'] = `attachment; filename="${metadata.name}"`;
      }

      let response: Response;
      
      if (isTextContent) {
        const decoder = new TextDecoder();
        const text = decoder.decode(data);
        response = new Response(text, {
          status: 200,
          headers: responseHeaders
        });
      } else {
        const bytes = new Uint8Array(data);
        response = new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: responseHeaders
        });
      }

      Logger.info('Data accessed', {
        path: pathname,
        fileId,
        contentType,
        size: data.length,
        isText: isTextContent,
        shouldDownload
      });

      return response;

    } catch (error) {
      Logger.error('Data access failed', error);
      
      if (error instanceof ApiError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          return null;
        }
        if (error.statusCode === 404) {
          return new Response(`File not found`, {
            status: 404,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
        return error.toResponse();
      }
      
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  private isTextContent(contentType: string): boolean {
    return contentType.startsWith('text/') || 
           contentType === 'application/json' ||
           contentType === 'application/javascript' ||
           contentType === 'application/xml' ||
           contentType === 'application/x-www-form-urlencoded';
  }

  private isDownloadable(contentType: string): boolean {
    const nonDownloadable = [
      'text/html',
      'text/plain',
      'application/json',
      'image/svg+xml'
    ];
    return !nonDownloadable.includes(contentType);
  }
}

export default DataAccessController;
