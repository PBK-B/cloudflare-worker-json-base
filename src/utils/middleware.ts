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

    let apiKey: string | null = null
    let method: 'bearer' | 'query' = 'bearer'

    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/)
      if (!match) {
        throw ApiError.unauthorized('Invalid Authorization header format')
      }
      apiKey = match[1]
      method = 'bearer'
    } else if (queryKey) {
      apiKey = queryKey
      method = 'query'
    } else {
      throw ApiError.unauthorized('API key required. Use Authorization: Bearer <key> or ?key=<key>')
    }

    if (!apiKey || apiKey !== AuthMiddleware.config.apiKey) {
      throw ApiError.forbidden('Invalid API key')
    }

    return {
      apiKey: apiKey!,
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
    const size = new Blob([data]).size
    const maxSize = 25 * 1024 * 1024 // 25MB

    if (size > maxSize) {
      throw ApiError.badRequest(`Data too large (max ${maxSize / 1024 / 1024}MB)`)
    }
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

export class RateLimiter {
  private static limits = new Map<string, { count: number; resetTime: number }>()

  static async checkLimit(key: string, limit: number = 1000, window: number = 3600): Promise<void> {
    const now = Date.now()
    const current = RateLimiter.limits.get(key)

    if (!current || now > current.resetTime) {
      RateLimiter.limits.set(key, { count: 1, resetTime: now + window * 1000 })
      return
    }

    if (current.count >= limit) {
      throw ApiError.badRequest('Rate limit exceeded')
    }

    current.count++
  }
}

export class Logger {
  private static isProduction(): boolean {
    try {
      const config = Config.getInstance({} as any)
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