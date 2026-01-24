import { ResponseBuilder, ApiError } from '../utils/response'
import { CorsHandler } from '../utils/response'
import { AuthMiddleware, ValidationMiddleware, RateLimiter, Logger } from '../utils/middleware'
import { D1StorageService } from '../database/d1Service'
import { WorkerEnv } from '../types'

export class DataController {
  private storageService: D1StorageService

  constructor(env: WorkerEnv) {
    this.storageService = new D1StorageService(env)
    AuthMiddleware.initialize(env)
    RateLimiter.initialize(env)
  }

  async get(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const pathname = url.pathname.replace('/api/data', '') || '/'

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

      const data = await this.storageService.getData(pathname)

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
      const pathname = url.pathname.replace('/api/data', '') || '/'

      ValidationMiddleware.validatePathname(pathname)
      
      const auth = await AuthMiddleware.requireAuth(request)
      await RateLimiter.checkLimit(auth.apiKey, 100, 3600)

      const requestData = await this.parseRequestBody(request)
      ValidationMiddleware.validateDataSize(JSON.stringify(requestData))

      const data = await this.storageService.createData(pathname, requestData)
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
      const pathname = url.pathname.replace('/api/data', '') || '/'

      ValidationMiddleware.validatePathname(pathname)
      
      const auth = await AuthMiddleware.requireAuth(request)
      await RateLimiter.checkLimit(auth.apiKey, 100, 3600)

      const requestData = await this.parseRequestBody(request)
      ValidationMiddleware.validateDataSize(JSON.stringify(requestData))

      const data = await this.storageService.updateData(pathname, requestData)
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
      const pathname = url.pathname.replace('/api/data', '') || '/'

      ValidationMiddleware.validatePathname(pathname)
      
      const auth = await AuthMiddleware.requireAuth(request)
      await RateLimiter.checkLimit(auth.apiKey, 50, 3600)

      await this.storageService.deleteData(pathname)
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
      const sort = url.searchParams.get('sort') || 'updatedAt'
      const order = url.searchParams.get('order') || 'desc'

      const auth = await AuthMiddleware.requireAuth(request)

      const result = await this.storageService.listData({
        prefix,
        search,
        page,
        limit: Math.min(limit, 1000),
        sort,
        order: order as 'asc' | 'desc'
      })
      
      Logger.info('Data listed', { 
        prefix, 
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
      return await request.json()
    }

    const body = await request.text()
    
    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      try {
        return JSON.parse(body)
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
  private storageService: D1StorageService

  constructor(env: WorkerEnv) {
    this.storageService = new D1StorageService(env)
  }

  async health(): Promise<Response> {
    try {
      const health = await this.storageService.getHealth()
      
      return ResponseBuilder.success({
        status: health.status,
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: 0,
        environment: 'production',
        services: {
          d1: health.db
        }
      })
    } catch (error) {
      Logger.error('Health check failed', error)
      const healthData = {
        status: 'unhealthy' as const,
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: 0,
        environment: 'production',
        services: {
          d1: false
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      
      return ResponseBuilder.success(healthData, 'Health check completed with issues')
    }
  }
}