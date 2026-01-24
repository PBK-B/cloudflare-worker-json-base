import { ResponseBuilder, ApiError } from '../utils/response'
import { CorsHandler } from '../utils/response'
import { AuthMiddleware, ValidationMiddleware, RateLimiter, Logger } from '../utils/middleware'
import { StorageAdapter } from '../storage/storageAdapter'
import { WorkerEnv } from '../types'
import { Config } from '../utils/config'

export class DataController {
  private storageAdapter: StorageAdapter

  constructor(env: WorkerEnv) {
    (globalThis as any).ENV = env;
    Config.getInstance(env);
    this.storageAdapter = new StorageAdapter({ env })
    AuthMiddleware.initialize(env)
    RateLimiter.initialize(env)
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  async get(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const pathname = url.pathname.replace('/._jsondb_/api/data', '') || '/'

      ValidationMiddleware.validatePathname(pathname)
      
      const auth = await AuthMiddleware.requireAuth(request)

      if (pathname === '/test') {
        return ResponseBuilder.success({
          status: 'ok',
          message: 'JSON Base API is working',
          timestamp: new Date().toISOString(),
          version: '2.0.0'
        })
      }

      const data = await this.storageAdapter.get(pathname)

      if (data.type === 'binary') {
        return ResponseBuilder.binary(
          await this.dataUrlToArrayBuffer(data.value),
          data.content_type || 'application/octet-stream',
          data.id.split('/').pop()
        )
      }

      return ResponseBuilder.success(data.value, 'Data retrieved successfully')
    } catch (error) {
      Logger.error('GET request failed', error)
      return this.handleError(error)
    }
  }

  async post(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const pathname = url.pathname.replace('/._jsondb_/api/data', '') || '/'

      ValidationMiddleware.validatePathname(pathname)
      
      const auth = await AuthMiddleware.requireAuth(request)
      await RateLimiter.checkLimit(auth.apiKey, 100, 3600)

      const contentType = request.headers.get('Content-Type') || ''

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const type = (formData.get('type') as string) || 'binary'

        if (!file) {
          throw ApiError.badRequest('File is required')
        }

        if (file.size === 0) {
          throw ApiError.badRequest('File is empty')
        }

        const maxSize = 100 * 1024 * 1024 // 100MB limit
        if (file.size > maxSize) {
          throw ApiError.badRequest(`File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`)
        }

        const arrayBuffer = await file.arrayBuffer()
        const base64 = this.arrayBufferToBase64(arrayBuffer)
        const mimeType = file.type || 'application/octet-stream'
        const dataUrl = `data:${mimeType};base64,${base64}`

        const data = await this.storageAdapter.create(pathname, {
          value: dataUrl,
          type: type as 'json' | 'text' | 'binary',
          content_type: mimeType
        })

        Logger.info('Data created from file', { pathname, filename: file.name, size: file.size, auth: auth.apiKey.substring(0, 8) })
        return ResponseBuilder.created(data, 'Data created successfully')
      }

      const requestData = await this.parseRequestBody(request)

      const type = (requestData as any)?.type || (requestData as any)?.dataType || 'json'
      
      const data = await this.storageAdapter.create(pathname, {
        value: (requestData as any)?.value ?? requestData,
        type: type as 'json' | 'text' | 'binary'
      })
      Logger.info('Data created', { pathname, auth: auth.apiKey.substring(0, 8) })

      return ResponseBuilder.created(data, 'Data created successfully')
    } catch (error) {
      Logger.error('POST request failed', error)
      return this.handleError(error)
    }
  }

  async put(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const pathname = url.pathname.replace('/._jsondb_/api/data', '') || '/'

      ValidationMiddleware.validatePathname(pathname)
      
      const auth = await AuthMiddleware.requireAuth(request)
      await RateLimiter.checkLimit(auth.apiKey, 100, 3600)

      const requestData = await this.parseRequestBody(request)

      const data = await this.storageAdapter.update(pathname, requestData)
      Logger.info('Data updated', { pathname, auth: auth.apiKey.substring(0, 8) })

      return ResponseBuilder.success(data, 'Data updated successfully')
    } catch (error) {
      Logger.error('PUT request failed', error)
      return this.handleError(error)
    }
  }

  async delete(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const pathname = url.pathname.replace('/._jsondb_/api/data', '') || '/'

      ValidationMiddleware.validatePathname(pathname)
      
      const auth = await AuthMiddleware.requireAuth(request)
      await RateLimiter.checkLimit(auth.apiKey, 50, 3600)

      await this.storageAdapter.delete(pathname)
      Logger.info('Data deleted', { pathname, auth: auth.apiKey.substring(0, 8) })

      return ResponseBuilder.noContent()
    } catch (error) {
      Logger.error('DELETE request failed', error)
      return this.handleError(error)
    }
  }

  async list(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const prefix = url.searchParams.get('prefix') || undefined
      const search = url.searchParams.get('search') || undefined
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '20')
      const sort = url.searchParams.get('sort') || 'updated_at'
      const order = url.searchParams.get('order') || 'desc'
      
      const sortField = sort === 'id' ? 'id' : sort === 'size' ? 'size' : 'updated_at'

      const auth = await AuthMiddleware.requireAuth(request)

      const result = await this.storageAdapter.list({
        search,
        page,
        limit: Math.min(limit, 1000),
        sort: sortField,
        order: order as 'asc' | 'desc'
      })
      
      Logger.info('Data listed', { 
        search, 
        page, 
        limit, 
        count: result.items.length, 
        total: result.total,
        auth: auth.apiKey.substring(0, 8) 
      })

      return ResponseBuilder.success(result, 'Data listed successfully')
    } catch (error) {
      Logger.error('LIST request failed', error)
      return this.handleError(error)
    }
  }

  private async parseRequestBody(request: Request): Promise<any> {
    const contentType = request.headers.get('Content-Type') || ''
    
    if (contentType.includes('application/json')) {
      const json = await request.json();
      return json;
    }

    const body = await request.text();
    
    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(body);
        return parsed;
      } catch {
        throw ApiError.badRequest('Invalid JSON format')
      }
    }

    if (body.startsWith('data:')) {
      return {
        value: body,
        type: 'binary',
        contentType: contentType
      }
    }

    return {
      value: body,
      type: 'text',
      contentType: contentType || 'text/plain'
    }
  }

  private async dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
    const url = new URL(dataUrl)
    if (url.protocol !== 'data:') {
      throw ApiError.badRequest('Invalid data URL format')
    }

    const [mimeType, base64] = url.pathname.split(';base64,')
    if (!base64) {
      throw ApiError.badRequest('Invalid data URL format')
    }

    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return bytes.buffer
  }

  private handleError(error: any): Response {
    if (error instanceof ApiError) {
      return error.toResponse()
    }

    Logger.error('Unexpected error', error)
    return ApiError.internal('Internal server error').toResponse()
  }
}

export class HealthController {
  private storageAdapter: StorageAdapter | null = null;
  private initError: Error | null = null;

  constructor(env: WorkerEnv) {
    try {
      (globalThis as any).ENV = env;
      Config.getInstance(env);
      AuthMiddleware.initialize(env);
      this.storageAdapter = new StorageAdapter({ env })
    } catch (error) {
      this.initError = error instanceof Error ? error : new Error('Unknown initialization error');
    }
  }

  async health(request?: Request): Promise<Response> {
    try {
      if (this.initError) {
        throw this.initError;
      }
      
      if (!this.storageAdapter) {
        throw new Error('StorageAdapter not initialized');
      }

      if (request) {
        try {
          const auth = await AuthMiddleware.requireAuth(request);
          const stats = await this.storageAdapter.getStats();
          
          return ResponseBuilder.success({
            status: 'healthy',
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            uptime: 0,
            environment: 'production',
            services: {
              storage: true,
              totalFiles: stats.total,
              totalSize: stats.totalSize
            },
            apiKey: {
              valid: true,
              method: auth.method
            }
          }, 'API key is valid');
        } catch (authError) {
          if (authError instanceof ApiError && authError.statusCode === 401) {
          }
        }
      }
      
      const stats = await this.storageAdapter.getStats()
      
      return ResponseBuilder.success({
        status: 'healthy',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: 0,
        environment: 'production',
        services: {
          storage: true,
          totalFiles: stats.total,
          totalSize: stats.totalSize
        }
      })
    } catch (error) {
      const healthData = {
        status: 'unhealthy' as const,
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: 0,
        environment: 'production',
        services: {
          d1: false
        },
        error: error instanceof Error ? error.message : String(error)
      }
      
      return ResponseBuilder.success(healthData, 'Health check completed with issues')
    }
  }
}
