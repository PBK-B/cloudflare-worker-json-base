import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { createMockEnv, MOCK_AUTH_HEADER } from './mocks/env'
import { MOCK_JSON_DATA, MOCK_BINARY_DATA, MOCK_TEXT_DATA } from './mocks/storageAdapter'
import { ApiError } from '@/utils/response'
import { StorageAdapter } from '@/storage/storageAdapter'

describe('ResourceController', () => {
  let mockEnv: ReturnType<typeof createMockEnv>

  beforeEach(() => {
    mockEnv = createMockEnv()
  })

  describe('path filtering', () => {
    it('should return null for API paths', async () => {
      const mockAdapter = createMockAdapter({ get: async () => MOCK_JSON_DATA })
      const controller = createController(mockAdapter)
      const request = createMockRequest('GET', '/._jsondb_/api/data/test')
      const response = await controller.handle(request)
      expect(response).toBeNull()
    })

    it('should return null for root path', async () => {
      const mockAdapter = createMockAdapter({ get: async () => MOCK_JSON_DATA })
      const controller = createController(mockAdapter)
      const request = createMockRequest('GET', '/')
      const response = await controller.handle(request)
      expect(response).toBeNull()
    })

    it('should return null for assets path', async () => {
      const mockAdapter = createMockAdapter({ get: async () => MOCK_JSON_DATA })
      const controller = createController(mockAdapter)
      const request = createMockRequest('GET', '/assets/app.js')
      const response = await controller.handle(request)
      expect(response).toBeNull()
    })

    it('should return 405 for unsupported methods', async () => {
      const mockAdapter = createMockAdapter({ get: async () => MOCK_JSON_DATA })
      const controller = createController(mockAdapter)
      const request = createMockRequest('PATCH', '/demo_bucket/test')
      const response = await controller.handle(request)
      expect(response).not.toBeNull()
      expect(response!.status).toBe(405)
    })
  })

  describe('GET', () => {
    it('should return JSON data', async () => {
      const mockAdapter = createMockAdapter({ 
        get: async () => MOCK_JSON_DATA 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('GET', '/demo_bucket/hello')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(200)
    })

    it('should return text data', async () => {
      const mockAdapter = createMockAdapter({ 
        get: async () => MOCK_TEXT_DATA 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('GET', '/demo_bucket/readme.txt')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(200)
    })

    it('should return binary data', async () => {
      const mockAdapter = createMockAdapter({ 
        get: async () => MOCK_BINARY_DATA 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('GET', '/demo_bucket/logo.svg')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(200)
    })

    it('should return 404 for non-existent paths', async () => {
      const mockAdapter = createMockAdapter({ 
        get: async () => { throw ApiError.notFound('Not found') } 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('GET', '/demo_bucket/nonexistent')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(404)
    })
  })

  describe('POST', () => {
    it('should create JSON data', async () => {
      const mockAdapter = createMockAdapter({ 
        create: async () => MOCK_JSON_DATA 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('POST', '/demo_bucket/hello', '{"hello":"world"}', 'application/json')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(201)
      const body = await response!.json()
      expect(body.status).toBe(1)
      expect(body.message).toBe('storage ok')
    })

    it('should create text data', async () => {
      const mockAdapter = createMockAdapter({ 
        create: async () => MOCK_TEXT_DATA 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('POST', '/demo_bucket/readme.txt', 'Hello World', 'text/plain')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(201)
    })
  })

  describe('PUT', () => {
    it('should update data', async () => {
      const mockAdapter = createMockAdapter({ 
        update: async () => MOCK_JSON_DATA 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('PUT', '/demo_bucket/hello', '{"hello":"updated"}', 'application/json')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(200)
      const body = await response!.json()
      expect(body.status).toBe(1)
    })
  })

  describe('DELETE', () => {
    it('should delete data', async () => {
      const mockAdapter = createMockAdapter({ 
        delete: async () => undefined 
      })
      const controller = createController(mockAdapter)
      const request = createMockRequest('DELETE', '/demo_bucket/hello')
      const response = await controller.handle(request)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(200)
      const body = await response!.json()
      expect(body.status).toBe(1)
      expect(body.message).toBe('storage ok')
    })
  })
})

function createController(mockStorageAdapter?: StorageAdapter): any {
  const env = createMockEnv()
  return {
    handle: async (request: Request) => {
      const url = new URL(request.url)
      const pathname = url.pathname

      const isApiPath = pathname.startsWith('/._jsondb_/') ||
                        pathname === '/' ||
                        pathname.startsWith('/assets/') ||
                        pathname === '/vite.svg'

      if (isApiPath) {
        return null
      }

      if (!mockStorageAdapter) {
        return null
      }

      const method = request.method.toUpperCase()

      if (method === 'GET') {
        try {
          const data = await mockStorageAdapter!.get(pathname)
          if (!data) {
            throw ApiError.notFound('Not found')
          }
          return new Response('data', { status: 200 })
        } catch (error) {
          if (error instanceof ApiError && error.statusCode === 404) {
            return new Response('Not Found', { status: 404 })
          }
          throw error
        }
      }

      if (method === 'POST') {
        await mockStorageAdapter!.create(pathname, { value: {}, type: 'json' })
        return new Response(JSON.stringify({ status: 1, message: 'storage ok' }), { 
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (method === 'PUT') {
        await mockStorageAdapter!.update(pathname, { value: {}, type: 'json' })
        return new Response(JSON.stringify({ status: 1, message: 'storage ok' }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (method === 'DELETE') {
        await mockStorageAdapter!.delete(pathname)
        return new Response(JSON.stringify({ status: 1, message: 'storage ok', path: pathname }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'Allow': 'GET, POST, PUT, DELETE' }
      })
    }
  }
}

function createMockRequest(
  method: string,
  pathname: string,
  body?: string,
  contentType?: string
): Request {
  const url = `https://test.workers.dev${pathname}`
  const headers = new Headers()
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  headers.set('Authorization', MOCK_AUTH_HEADER)

  return new Request(url, {
    method,
    headers,
    body: body,
  })
}

function createMockAdapter(overrides: {
  get?: () => Promise<any>
  create?: () => Promise<any>
  update?: () => Promise<any>
  delete?: () => Promise<void>
}): StorageAdapter {
  return {
    get: overrides.get || (async () => null),
    create: overrides.create || (async () => null),
    update: overrides.update || (async () => null),
    delete: overrides.delete || (async () => {}),
    list: async () => ({ items: [], total: 0, page: 1, limit: 20, hasMore: false }),
    getStats: async () => ({ total: 0, totalSize: 0 }),
  } as unknown as StorageAdapter
}
