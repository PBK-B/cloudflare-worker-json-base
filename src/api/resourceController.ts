import { WorkerEnv } from '../types'
import { StorageAdapter } from '../storage/storageAdapter'
import { Config } from '../utils/config'
import { AuthMiddleware, Logger } from '../utils/middleware'
import { ApiError } from '../utils/response'
import { PermissionService } from '../permissions/permissionService'
import { isSystemPath } from '../system/systemPaths'

interface ResourceResult {
  status: number
  message: string
  path?: string
  size?: number
  contentType?: string
}

export class ResourceController {
  private storageAdapter: StorageAdapter
  private permissionService: PermissionService

  constructor(env: WorkerEnv, mockStorageAdapter?: StorageAdapter) {
    ;(globalThis as any).ENV = env
    Config.getInstance(env)
    this.storageAdapter = mockStorageAdapter || new StorageAdapter({ env })
    this.permissionService = new PermissionService(env)
    AuthMiddleware.initialize(env)
  }

  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    let pathname = url.pathname

    try {
      const method = request.method.toUpperCase()

      const isApiPath = pathname.startsWith('/._jsondb_/') ||
                        isSystemPath(pathname) ||
                        pathname === '/' ||
                        pathname.startsWith('/assets/') ||
                        pathname === '/vite.svg'

      if (isApiPath) {
        return null
      }

      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
          }
        })
      }

      switch (method) {
        case 'GET':
          return await this.get(pathname, request)
        case 'HEAD':
          return await this.head(pathname, request)
        case 'POST':
          return await this.post(pathname, request)
        case 'PUT':
          return await this.put(pathname, request)
        case 'DELETE':
          return await this.delete(pathname, request)
        default:
          return new Response('Method Not Allowed', {
            status: 405,
            headers: { 'Allow': 'GET, HEAD, POST, PUT, DELETE' }
          })
      }
    } catch (error) {
      if (error instanceof ApiError) {
        return error.toResponse()
      }
      Logger.error('Resource controller error', { pathname, error })
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  private async get(pathname: string, request: Request): Promise<Response> {
    try {
      await this.authorize(pathname, 'read', request)
      const data = await this.storageAdapter.get(pathname)

      const contentType = data.content_type || 'application/octet-stream'
      const isTextContent = this.isTextContent(contentType)
      const shouldDownload = !isTextContent && this.isDownloadable(contentType)

      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      }

      if (shouldDownload) {
        const filename = pathname.split('/').pop() || 'download'
        responseHeaders['Content-Disposition'] = `attachment; filename="${filename}"`
      }

      let response: Response

      if (data.type === 'json') {
        const jsonBody = typeof data.value === 'string'
          ? data.value
          : JSON.stringify(data.value)
        response = new Response(jsonBody, {
          status: 200,
          headers: responseHeaders
        })
      } else if (isTextContent) {
        const textValue = typeof data.value === 'string' ? data.value : String(data.value)
        response = new Response(textValue, {
          status: 200,
          headers: responseHeaders
        })
      } else {
        let arrayBuffer: ArrayBuffer
        if (data.value instanceof Uint8Array) {
          arrayBuffer = data.value.buffer as ArrayBuffer
        } else {
          arrayBuffer = await this.dataUrlToArrayBuffer(data.value as string)
        }
        response = new Response(arrayBuffer, {
          status: 200,
          headers: responseHeaders
        })
      }

      return response
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return new Response('Not Found', { status: 404 })
      }
      throw error
    }
  }

  private async head(pathname: string, request: Request): Promise<Response> {
    try {
      await this.authorize(pathname, 'read', request)
      const data = await this.storageAdapter.get(pathname)

      const contentType = data.content_type || 'application/octet-stream'
      const shouldDownload = !this.isTextContent(contentType) && this.isDownloadable(contentType)

      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Length': String(data.size || 0),
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      }

      if (shouldDownload) {
        const filename = pathname.split('/').pop() || 'download'
        responseHeaders['Content-Disposition'] = `attachment; filename="${filename}"`
      }

      return new Response(null, {
        status: 200,
        headers: responseHeaders
      })
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return new Response('Not Found', { status: 404 })
      }
      throw error
    }
  }

  private async post(pathname: string, request: Request): Promise<Response> {
    await this.authorize(pathname, 'write', request)
    const contentType = request.headers.get('Content-Type') || ''
    let result: ResourceResult

    if (contentType.includes('multipart/form-data')) {
      const payload = await this.parseMultipartFile(request)
      if (payload) {
        await this.storageAdapter.upsert(pathname, payload)

        result = {
          status: 1,
          message: 'storage ok',
          path: pathname,
          size: payload.size,
          contentType: payload.content_type
        }

        return new Response(JSON.stringify(result), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    const body = await this.parseRequestBody(request, contentType)

    await this.storageAdapter.upsert(pathname, {
      value: body.value,
      type: body.type,
      content_type: body.contentType
    })

    result = {
      status: 1,
      message: 'storage ok',
      path: pathname,
      size: body.size
    }

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async put(pathname: string, request: Request): Promise<Response> {
    await this.authorize(pathname, 'write', request)
    const contentType = request.headers.get('Content-Type') || ''

    if (contentType.includes('multipart/form-data')) {
      const payload = await this.parseMultipartFile(request)
      if (payload) {
        await this.storageAdapter.upsert(pathname, payload)

        const result: ResourceResult = {
          status: 1,
          message: 'storage ok',
          path: pathname,
          size: payload.size,
          contentType: payload.content_type
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    const body = await this.parseRequestBody(request, contentType)

    await this.storageAdapter.upsert(pathname, {
      value: body.value,
      type: body.type,
      content_type: body.contentType
    })

    const result: ResourceResult = {
      status: 1,
      message: 'storage ok',
      path: pathname,
      size: body.size
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async delete(pathname: string, request: Request): Promise<Response> {
    await this.authorize(pathname, 'write', request)
    await this.storageAdapter.delete(pathname)

    const result: ResourceResult = {
      status: 1,
      message: 'storage ok',
      path: pathname
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async authorize(pathname: string, action: 'read' | 'write', request?: Request): Promise<void> {
    const decision = await this.permissionService.evaluate({ path: pathname, action })
    if (decision.allowed) {
      return
    }

    if (!request) {
      throw ApiError.forbidden(`Path ${pathname} requires private ${action} access`)
    }

    const auth = await AuthMiddleware.authenticate(request)
    Logger.debug('Resource access requires private auth', {
      path: pathname,
      action,
      auth: auth.apiKey.substring(0, 8)
    })
  }

  private async parseRequestBody(request: Request, contentType: string): Promise<{
    value: any
    type: 'json' | 'text' | 'binary'
    contentType: string
    size: number
  }> {
    const body = await request.text()

    if (!body || body.trim() === '') {
      return {
        value: {},
        type: 'json',
        contentType: 'application/json',
        size: 0
      }
    }

    if (contentType.includes('application/json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
      try {
        const json = JSON.parse(body)
        return {
          value: json,
          type: 'json',
          contentType: 'application/json',
          size: body.length
        }
      } catch {
        return {
          value: body,
          type: 'text',
          contentType: contentType || 'text/plain',
          size: body.length
        }
      }
    }

    if (this.isValidDataUrl(body)) {
      return {
        value: body,
        type: 'binary',
        contentType: contentType || 'application/octet-stream',
        size: body.length
      }
    }

    return {
      value: body,
      type: 'text',
      contentType: contentType || 'text/plain',
      size: body.length
    }
  }

  private isValidDataUrl(url: string): boolean {
    if (!url.startsWith('data:')) {
      return false;
    }
    const dataUrlPattern = /^data:([a-zA-Z0-9!#$&+^_.-]+\/[a-zA-Z0-9!#$&+^_.-]+);base64,/;
    return dataUrlPattern.test(url);
  }

  private async parseMultipartFile(request: Request): Promise<{
    value: Uint8Array
    type: 'binary'
    content_type: string
    size: number
  } | null> {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || file.size === 0) {
      return null
    }

    const arrayBuffer = await file.arrayBuffer()
    const mimeType = file.type || 'application/octet-stream'

    return {
      value: new Uint8Array(arrayBuffer),
      type: 'binary',
      content_type: mimeType,
      size: file.size
    }
  }

  private async dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      const encoder = new TextEncoder()
      return encoder.encode(String(dataUrl)).buffer
    }

    const [mimeType, base64] = dataUrl.split(';base64,')
    if (!base64) {
      const encoder = new TextEncoder()
      return encoder.encode(dataUrl).buffer
    }

    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  private isTextContent(contentType: string): boolean {
    return contentType.startsWith('text/') ||
           contentType === 'application/json' ||
           contentType === 'application/javascript' ||
           contentType === 'application/xml' ||
           contentType === 'application/x-www-form-urlencoded' ||
           contentType === 'application/typescript'
  }

  private isDownloadable(contentType: string): boolean {
    const nonDownloadable = [
      'text/html',
      'text/plain',
      'application/json',
      'image/svg+xml'
    ]
    return !nonDownloadable.includes(contentType)
  }
}

export default ResourceController
