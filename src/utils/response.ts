import { ApiResponse, ErrorDetail } from '../types'
import { HTTP_STATUS, ERROR_CODES, CONTENT_TYPES } from '../utils/config'

export class ApiError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly details?: any
  public readonly timestamp: string

  constructor(
    code: string,
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    details?: any
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.timestamp = new Date().toISOString()
  }

  toResponse(): Response {
    const errorDetail: ErrorDetail = {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    }

    const response: ApiResponse = {
      success: false,
      error: this.message,
      timestamp: this.timestamp
    }

    return new Response(JSON.stringify(response, null, 2), {
      status: this.statusCode,
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(ERROR_CODES.UNAUTHORIZED, message, HTTP_STATUS.UNAUTHORIZED)
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(ERROR_CODES.INVALID_API_KEY, message, HTTP_STATUS.FORBIDDEN)
  }

  static notFound(message: string = 'Resource not found'): ApiError {
    return new ApiError(ERROR_CODES.KV_NOT_FOUND, message, HTTP_STATUS.NOT_FOUND)
  }

  static badRequest(message: string, details?: any): ApiError {
    return new ApiError(ERROR_CODES.VALIDATION_ERROR, message, HTTP_STATUS.BAD_REQUEST, details)
  }

  static internal(message: string = 'Internal server error', details?: any): ApiError {
    return new ApiError(ERROR_CODES.INTERNAL_ERROR, message, HTTP_STATUS.INTERNAL_SERVER_ERROR, details)
  }

  static tooManyRequests(message: string = 'Rate limit exceeded', details?: any): ApiError {
    return new ApiError(ERROR_CODES.RATE_LIMIT_EXCEEDED, message, HTTP_STATUS.TOO_MANY_REQUESTS, details)
  }

  static serviceUnavailable(message: string = 'Service unavailable'): ApiError {
    return new ApiError('SERVICE_UNAVAILABLE', message, HTTP_STATUS.SERVICE_UNAVAILABLE)
  }
}

export class ResponseBuilder {
  static success<T>(data: T, message?: string): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    }

    return new Response(JSON.stringify(response, null, 2), {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }

  static created<T>(data: T, message?: string): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    }

    return new Response(JSON.stringify(response, null, 2), {
      status: HTTP_STATUS.CREATED,
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }

  static noContent(): Response {
    return new Response(null, {
      status: HTTP_STATUS.NO_CONTENT,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }

  static html(content: string): Response {
    return new Response(content, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': CONTENT_TYPES.HTML,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  }

  static binary(data: ArrayBuffer, contentType: string, filename?: string): Response {
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    }

    if (filename) {
      headers['Content-Disposition'] = `attachment; filename="${filename}"`
    }

    return new Response(data, {
      status: HTTP_STATUS.OK,
      headers
    })
  }
}

export class CorsHandler {
  static handle(request: Request): Response | null {
    const origin = request.headers.get('Origin')
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: HTTP_STATUS.NO_CONTENT,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      })
    }

    return null
  }

  static addHeaders(response: Response, request: Request): Response {
    const origin = request.headers.get('Origin')
    response.headers.set('Access-Control-Allow-Origin', origin || '*')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    return response
  }
}