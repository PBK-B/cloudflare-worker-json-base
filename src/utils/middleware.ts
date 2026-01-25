import { AuthContext, WorkerEnv } from '../types'
import { Config } from '../utils/config'
import { ApiError } from '../utils/response'
import { ERROR_CODES } from '../utils/config'

export class AuthMiddleware {
  private static config: Config

  static initialize(env: WorkerEnv): void {
    AuthMiddleware.config = Config.getInstance(env)
  }

  static async authenticate(request: Request): Promise<AuthContext> {
    const url = new URL(request.url)
    const authHeader = request.headers.get('Authorization')
    const queryKey = url.searchParams.get('key')

    Logger.debug('AuthMiddleware authenticate', {
      url: url.pathname,
      method: request.method,
      hasAuthHeader: !!authHeader,
      hasQueryKey: !!queryKey
    })

    let apiKey: string | null = null
    let method: 'bearer' | 'query' = 'bearer'

    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/)
      if (!match) {
        Logger.warn('Invalid Authorization header format', { authHeader })
        throw ApiError.unauthorized('Invalid Authorization header format')
      }
      apiKey = match[1].trim()
      method = 'bearer'
      Logger.debug('Using bearer auth', { keyPrefix: apiKey.substring(0, 8) })
    } else if (queryKey) {
      apiKey = queryKey.trim()
      method = 'query'
      Logger.debug('Using query auth', { keyPrefix: apiKey.substring(0, 8) })
    } else {
      Logger.warn('No authentication provided', { url: url.pathname })
      throw ApiError.unauthorized('API key required. Use Authorization: Bearer <key> or ?key=<key>')
    }

    if (!apiKey) {
      throw ApiError.unauthorized('API key cannot be empty')
    }

    if (!AuthMiddleware.config) {
      Logger.error('AuthMiddleware.config not initialized')
      throw ApiError.internal('Authentication system not initialized')
    }

    const expectedKey = AuthMiddleware.config.apiKey

    if (!expectedKey) {
      Logger.error('API_KEY not configured in environment')
      throw ApiError.internal('API key not configured on server')
    }

    if (apiKey !== expectedKey) {
      Logger.warn('API key mismatch', {
        receivedKeyPrefix: apiKey.substring(0, 8),
        expectedKeyPrefix: expectedKey.substring(0, 8),
        method
      })
      throw ApiError.forbidden('Invalid API key')
    }

    return {
      apiKey,
      method,
      valid: true
    }
  }

  static async requireAuth(request: Request): Promise<AuthContext> {
    return await this.authenticate(request)
  }
}

export class ValidationMiddleware {
  static validatePathname(pathname: string): void {
    if (!pathname || pathname === '/') {
      throw ApiError.badRequest('Pathname is required for data operations')
    }

    if (pathname.length > 1000) {
      throw ApiError.badRequest('Pathname too long (max 1000 characters)')
    }

    if (!/^\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(pathname)) {
      throw ApiError.badRequest('Invalid pathname format')
    }

    if (pathname.startsWith('/._jsondb_/')) {
      throw ApiError.forbidden('Pathname cannot start with /._jsondb_/ - this prefix is reserved for system use')
    }
  }

  static validateApiKey(apiKey: string): void {
    if (!apiKey || apiKey.trim().length === 0) {
      throw ApiError.badRequest('API key cannot be empty')
    }

    if (apiKey.length > 256) {
      throw ApiError.badRequest('API key too long (max 256 characters)')
    }
  }

  static validateDataSize(data: string): void {
    // No size limit - using hybrid storage (D1 + KV) for all file sizes
    Logger.debug('Data size validation skipped - using hybrid storage')
  }

  static validateFileSize(fileSize: number): void {
    // No size limit - using hybrid storage (D1 + KV) for all file sizes
    Logger.debug('File size validation skipped', { fileSize })
  }

  static validateBase64Size(base64String: string): void {
    // No size limit - using hybrid storage (D1 + KV) for all file sizes
    Logger.debug('Base64 size validation skipped', { size: new Blob([base64String]).size })
  }

  static validateContentType(contentType: string): void {
    const allowedTypes = [
      'application/json',
      'text/plain',
      'application/octet-stream',
      'text/html',
      'text/css',
      'application/javascript',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/svg+xml'
    ]

    if (!allowedTypes.includes(contentType)) {
      throw ApiError.badRequest(`Content type ${contentType} not allowed`)
    }
  }
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

export class RateLimiter {
  private static kvNamespace: KVNamespace | null = null
  private static limits = new Map<string, { count: number; resetTime: number }>()

  static initialize(env: WorkerEnv): void {
    RateLimiter.kvNamespace = env.JSONBIN as KVNamespace
  }

  static async checkLimit(key: string, limit: number = 1000, window: number = 3600): Promise<void> {
    if (!RateLimiter.kvNamespace) {
      Logger.warn('RateLimiter not initialized, using memory fallback')
      return RateLimiter.memoryCheckLimit(key, limit, window)
    }

    const now = Date.now()
    const rateLimitKey = `ratelimit:${key}:${Math.floor(now / (window * 1000))}`

    try {
      const existing = await RateLimiter.kvNamespace.get(rateLimitKey, 'json') as RateLimitEntry | null

      if (!existing || now > existing.resetTime) {
        await RateLimiter.kvNamespace.put(rateLimitKey, JSON.stringify({
          count: 1,
          resetTime: now + window * 1000
        }), { expirationTtl: window * 2 })
        return
      }

      if (existing.count >= limit) {
        const retryAfter = Math.ceil((existing.resetTime - now) / 1000)
        throw ApiError.tooManyRequests('Rate limit exceeded', { retryAfter })
      }

      const newCount = existing.count + 1
      await RateLimiter.kvNamespace.put(rateLimitKey, JSON.stringify({
        count: newCount,
        resetTime: existing.resetTime
      }), { expirationTtl: window * 2 })

    } catch (error) {
      if (error instanceof ApiError) throw error
      Logger.error('Rate limit check failed', error)
      throw ApiError.serviceUnavailable('Rate limit service unavailable')
    }
  }

  private static memoryCheckLimit(key: string, limit: number, window: number): void {
    const now = Date.now()
    const current = RateLimiter.limits.get(key)

    if (!current || now > current.resetTime) {
      RateLimiter.limits.set(key, { count: 1, resetTime: now + window * 1000 })
      return
    }

    if (current.count >= limit) {
      throw ApiError.tooManyRequests('Rate limit exceeded')
    }

    current.count++
  }
}

export class Logger {
  private static isProduction(): boolean {
    try {
      const config = Config.getInstance()
      return config.isProduction
    } catch {
      return false
    }
  }

  static info(message: string, data?: any): void {
    if (!this.isProduction()) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data || '')
    }
  }

  static warn(message: string, data?: any): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data || '')
  }

  static error(message: string, error?: any): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '')
  }

  static debug(message: string, data?: any): void {
    if (!this.isProduction()) {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, data || '')
    }
  }
}