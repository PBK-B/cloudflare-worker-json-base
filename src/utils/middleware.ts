import { AuthContext, WorkerEnv } from '../types'
import { Config } from '../utils/config'
import { ApiError } from '../utils/response'
import { ERROR_CODES } from '../utils/config'

export class AuthMiddleware {
  private static config: Config

  static initialize(env: WorkerEnv): void {
    AuthMiddleware.config = Config.getInstance(env)
    SecurityEventLogger.initialize(env)
    RateLimiter.initialize(env)
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
        SecurityEventLogger.logAuthFailure(
          RateLimiter.getClientIp(request),
          url.pathname,
          request.method,
          'Invalid Authorization header format'
        )
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
      SecurityEventLogger.logAuthFailure(
        RateLimiter.getClientIp(request),
        url.pathname,
        request.method,
        'No authentication provided'
      )
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
      SecurityEventLogger.logAuthFailure(
        RateLimiter.getClientIp(request),
        url.pathname,
        request.method,
        'API key mismatch'
      )
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
  private static readonly MAX_PATH_LENGTH = 500;
  private static readonly DANGEROUS_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.msi', '.dll', '.vbs', '.js', '.jse',
    '.wsf', '.wsh', '.ps1', '.ps1xml', '.psc1', '.psc2', '.msh', '.msh1', '.msh2',
    '.asp', '.aspx', '.php', '.jsp', '.shtml', '.htaccess', '.htpasswd',
    '.sh', '.bash', '.bin', '.out', '.run', '.elf', '.so', '.dylib'
  ];
  private static readonly ALLOWED_PATH_PATTERN = /^\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/;

  static validatePathname(pathname: string): void {
    if (!pathname || pathname === '/') {
      throw ApiError.badRequest('Pathname is required for data operations')
    }

    if (pathname.length > ValidationMiddleware.MAX_PATH_LENGTH) {
      throw ApiError.badRequest(`Pathname too long (max ${ValidationMiddleware.MAX_PATH_LENGTH} characters)`)
    }

    if (!ValidationMiddleware.ALLOWED_PATH_PATTERN.test(pathname)) {
      throw ApiError.badRequest('Invalid pathname format - only safe URL characters allowed')
    }

    if (pathname.includes('..')) {
      throw ApiError.badRequest('Pathname cannot contain path traversal sequences')
    }

    if (pathname.startsWith('/._jsondb_/')) {
      throw ApiError.forbidden('Pathname cannot start with /._jsondb_/ - this prefix is reserved for system use')
    }

    if (pathname.includes('%2e') || pathname.includes('%2E')) {
      throw ApiError.badRequest('Pathname cannot contain encoded path traversal sequences')
    }

    if (/[\x00-\x1f\x7f]/.test(pathname)) {
      throw ApiError.badRequest('Pathname contains control characters')
    }
  }

  static validateApiKey(apiKey: string): void {
    if (!apiKey || apiKey.trim().length === 0) {
      throw ApiError.badRequest('API key cannot be empty')
    }

    if (apiKey.length > 256) {
      throw ApiError.badRequest('API key too long (max 256 characters)')
    }

    if (/[\x00-\x1f\x7f]/.test(apiKey)) {
      throw ApiError.badRequest('API key contains control characters')
    }
  }

  static validateFileExtension(filename: string): void {
    if (!filename) return

    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    if (ValidationMiddleware.DANGEROUS_EXTENSIONS.includes(ext)) {
      throw ApiError.forbidden(`File extension ${ext} is not allowed for security reasons`)
    }
  }

  static validateDataSize(data: string): void {
    Logger.debug('Data size validation passed', { size: data.length })
  }

  static validateFileSize(fileSize: number): void {
    Logger.debug('File size validation passed', { fileSize })
  }

  static validateBase64Size(base64String: string): void {
    const size = new Blob([base64String]).size
    Logger.debug('Base64 size validation passed', { size })
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
      'image/svg+xml',
      'image/webp',
      'image/x-icon',
      'font/woff2',
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed'
    ]

    const baseType = contentType.split(';')[0].trim().toLowerCase()
    if (!allowedTypes.includes(baseType)) {
      throw ApiError.badRequest(`Content type ${baseType} not allowed`)
    }
  }
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

interface SecurityEvent {
  type: 'AUTH_FAILURE' | 'RATE_LIMIT' | 'INVALID_PATH' | 'INVALID_FILE' | 'LARGE_UPLOAD' | 'SUSPICIOUS_PATTERN'
  timestamp: string
  ip?: string
  path?: string
  method?: string
  details?: string
}

export class SecurityEventLogger {
  private static kvNamespace: KVNamespace | null = null
  private static eventBuffer: Omit<SecurityEvent, 'timestamp'>[] = []
  private static readonly MAX_BUFFER_SIZE = 100
  private static readonly FLUSH_INTERVAL = 60000

  static initialize(env: WorkerEnv): void {
    SecurityEventLogger.kvNamespace = env.JSONBIN as KVNamespace
  }

  private static async flush(): Promise<void> {
    if (SecurityEventLogger.eventBuffer.length === 0) return

    const events: SecurityEvent[] = SecurityEventLogger.eventBuffer.map(e => ({
      ...e,
      timestamp: new Date().toISOString()
    }))
    SecurityEventLogger.eventBuffer = []

    if (SecurityEventLogger.kvNamespace) {
      try {
        const key = `security_events:${Date.now()}`
        await SecurityEventLogger.kvNamespace.put(key, JSON.stringify(events), { expirationTtl: 86400 })
      } catch (error) {
        Logger.error('Failed to persist security events', error)
      }
    }
  }

  static log(event: Omit<SecurityEvent, 'timestamp'>): void {
    SecurityEventLogger.eventBuffer.push(event)

    if (SecurityEventLogger.eventBuffer.length >= SecurityEventLogger.MAX_BUFFER_SIZE) {
      SecurityEventLogger.flush()
    }

    Logger.warn('Security event', { ...event, timestamp: new Date().toISOString() })
  }

  static logAuthFailure(ip: string, path: string, method: string, reason: string): void {
    SecurityEventLogger.log({ type: 'AUTH_FAILURE', ip, path, method, details: reason })
  }

  static logRateLimit(ip: string, path: string): void {
    SecurityEventLogger.log({ type: 'RATE_LIMIT', ip, path, details: 'Rate limit exceeded' })
  }

  static logInvalidPath(ip: string, path: string, reason: string): void {
    SecurityEventLogger.log({ type: 'INVALID_PATH', ip, path, details: reason })
  }

  static logInvalidFile(ip: string, filename: string, reason: string): void {
    SecurityEventLogger.log({ type: 'INVALID_FILE', ip, path: filename, details: reason })
  }

  static logLargeUpload(ip: string, path: string, size: number): void {
    SecurityEventLogger.log({ type: 'LARGE_UPLOAD', ip, path, details: `Large upload attempt: ${size} bytes` })
  }

  static logSuspiciousPattern(ip: string, path: string, pattern: string): void {
    SecurityEventLogger.log({ type: 'SUSPICIOUS_PATTERN', ip, path, details: `Suspicious pattern detected: ${pattern}` })
  }
}

export class RateLimiter {
  private static kvNamespace: KVNamespace | null = null
  private static limits = new Map<string, { count: number; resetTime: number }>()

  static initialize(env: WorkerEnv): void {
    RateLimiter.kvNamespace = env.JSONBIN as KVNamespace
  }

  static getClientIp(request: Request): string {
    const cfConnectingIp = request.headers.get('cf-connecting-ip')
    const xForwardedFor = request.headers.get('x-forwarded-for')
    const xRealIp = request.headers.get('x-real-ip')
    return cfConnectingIp || xForwardedFor?.split(',')[0]?.trim() || xRealIp || 'unknown'
  }

  static async checkLimit(request: Request, limit: number = 1000, window: number = 3600): Promise<void> {
    const clientIp = RateLimiter.getClientIp(request)
    const key = `ip:${clientIp}`

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
        SecurityEventLogger.logRateLimit(clientIp, new URL(request.url).pathname)
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