import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Buffer } from 'node:buffer'
import { ResourceController } from '../../api/resourceController'
import { createMockEnv, VALID_API_KEY } from './mocks/env'
import { ApiError } from '../../utils/response'
import { StorageAdapter } from '../../storage/storageAdapter'

describe('资源控制器', () => {
  let mockEnv: ReturnType<typeof createMockEnv>
  let store: Map<string, StoredEntry>
  let controller: ResourceController

  beforeEach(() => {
    mockEnv = createMockEnv()
    store = new Map<string, StoredEntry>()
    controller = new ResourceController(mockEnv, createInMemoryStorageAdapter(store))
  })

  describe('路径过滤', () => {
    it('应该对 API 路径返回 null', async () => {
      const request = createRequest('GET', '/._jsondb_/api/data/test')
      const response = await controller.handle(request)
      expect(response).toBeNull()
    })

    it('应该对根路径返回 null', async () => {
      const request = createRequest('GET', '/')
      const response = await controller.handle(request)
      expect(response).toBeNull()
    })

    it('应该对静态资源路径返回 null', async () => {
      const request = createRequest('GET', '/assets/app.js')
      const response = await controller.handle(request)
      expect(response).toBeNull()
    })

    it('应该对不支持的方法返回 405', async () => {
      const request = createRequest('PATCH', '/demo_bucket/test')
      const response = await controller.handle(request)
      expect(response).not.toBeNull()
      expect(response!.status).toBe(405)
    })
  })

  describe('JSON 资源 CRUD', () => {
    it('应该完成 JSON 资源的增删改查', async () => {
      const pathname = '/integration/json'

      const createResponse = await controller.handle(
        createRequest('POST', pathname, JSON.stringify({ hello: 'world' }), 'application/json')
      )
      expect(createResponse).not.toBeNull()
      expect(createResponse!.status).toBe(201)

      const getResponse = await controller.handle(createRequest('GET', pathname))
      expect(getResponse).not.toBeNull()
      expect(getResponse!.status).toBe(200)
      expect(await getResponse!.json()).toEqual({ hello: 'world' })

      const headResponse = await controller.handle(createRequest('HEAD', pathname))
      expect(headResponse).not.toBeNull()
      expect(headResponse!.status).toBe(200)
      expect(headResponse!.headers.get('Content-Type')).toBe('application/json')

      const updateResponse = await controller.handle(
        createRequest('PUT', pathname, JSON.stringify({ hello: 'updated', count: 2 }), 'application/json')
      )
      expect(updateResponse).not.toBeNull()
      expect(updateResponse!.status).toBe(200)

      const updatedGetResponse = await controller.handle(createRequest('GET', pathname))
      expect(updatedGetResponse).not.toBeNull()
      expect(await updatedGetResponse!.json()).toEqual({ hello: 'updated', count: 2 })

      const deleteResponse = await controller.handle(createRequest('DELETE', pathname))
      expect(deleteResponse).not.toBeNull()
      expect(deleteResponse!.status).toBe(200)

      const missingResponse = await controller.handle(createRequest('GET', pathname))
      expect(missingResponse).not.toBeNull()
      expect(missingResponse!.status).toBe(404)
    })
  })

  describe('文本资源 CRUD', () => {
    it('应该完成文本资源的增删改查', async () => {
      const pathname = '/integration/readme.txt'

      await controller.handle(createRequest('POST', pathname, 'hello text', 'text/plain'))

      const getResponse = await controller.handle(createRequest('GET', pathname))
      expect(getResponse).not.toBeNull()
      expect(getResponse!.status).toBe(200)
      expect(await getResponse!.text()).toBe('hello text')

      const updateResponse = await controller.handle(createRequest('PUT', pathname, 'updated text body', 'text/plain'))
      expect(updateResponse).not.toBeNull()
      expect(updateResponse!.status).toBe(200)

      const updatedGetResponse = await controller.handle(createRequest('GET', pathname))
      expect(updatedGetResponse).not.toBeNull()
      expect(await updatedGetResponse!.text()).toBe('updated text body')

      const deleteResponse = await controller.handle(createRequest('DELETE', pathname))
      expect(deleteResponse).not.toBeNull()
      expect(deleteResponse!.status).toBe(200)

      const missingResponse = await controller.handle(createRequest('GET', pathname))
      expect(missingResponse).not.toBeNull()
      expect(missingResponse!.status).toBe(404)
    })
  })

  describe('二进制资源 CRUD', () => {
    it('应该完成二进制资源的增删改查', async () => {
      const pathname = '/integration/file.dat'
      const originalBinary = createBinaryPayload(1024)
      const updatedBinary = createBinaryPayload(1536)
      const originalDataUrl = toDataUrl(originalBinary, 'application/octet-stream')
      const updatedDataUrl = toDataUrl(updatedBinary, 'application/octet-stream')

      const createResponse = await controller.handle(
        createRequest('POST', pathname, originalDataUrl, 'application/octet-stream')
      )
      expect(createResponse).not.toBeNull()
      expect(createResponse!.status).toBe(201)

      const getResponse = await controller.handle(createRequest('GET', pathname))
      expect(getResponse).not.toBeNull()
      expect(getResponse!.status).toBe(200)
      expect(getResponse!.headers.get('Content-Type')).toBe('application/octet-stream')
      expect(decodeStoredBinary(store, pathname)).toEqual(Array.from(originalBinary))

      const headResponse = await controller.handle(createRequest('HEAD', pathname))
      expect(headResponse).not.toBeNull()
      expect(headResponse!.status).toBe(200)
      expect(headResponse!.headers.get('Content-Length')).toBe(String(originalBinary.length))
      expect(headResponse!.headers.get('Content-Disposition')).toContain('file.dat')

      const updateResponse = await controller.handle(
        createRequest('PUT', pathname, updatedDataUrl, 'application/octet-stream')
      )
      expect(updateResponse).not.toBeNull()
      expect(updateResponse!.status).toBe(200)

      const updatedGetResponse = await controller.handle(createRequest('GET', pathname))
      expect(updatedGetResponse).not.toBeNull()
      expect(updatedGetResponse!.status).toBe(200)
      expect(decodeStoredBinary(store, pathname)).toEqual(Array.from(updatedBinary))

      const deleteResponse = await controller.handle(createRequest('DELETE', pathname))
      expect(deleteResponse).not.toBeNull()
      expect(deleteResponse!.status).toBe(200)

      const missingResponse = await controller.handle(createRequest('GET', pathname))
      expect(missingResponse).not.toBeNull()
      expect(missingResponse!.status).toBe(404)
    })

    it('应该将 multipart 文件解析为原始字节数组而不转为 data url', async () => {
      const binary = createBinaryPayload(2 * 1024 * 1024)
      const request = createRequest('POST', '/integration/large-file.bin', '--test-boundary--', 'multipart/form-data; boundary=test-boundary')
      const file = {
        size: binary.byteLength,
        type: 'application/octet-stream',
        arrayBuffer: jest.fn(async () => binary.buffer.slice(0))
      } as unknown as File

      Object.defineProperty(request, 'formData', {
        value: jest.fn(async () => ({
          get: (key: string) => (key === 'file' ? file : null)
        }))
      })

      const payload = await (controller as any).parseMultipartFile(request)

      expect(payload).not.toBeNull()
      expect(payload.type).toBe('binary')
      expect(payload.content_type).toBe('application/octet-stream')
      expect(payload.value).toBeInstanceOf(Uint8Array)
      expect(Array.from(payload.value as Uint8Array)).toEqual(Array.from(binary))
    })
  })
})

type StoredEntry = {
  value: unknown
  type: 'json' | 'text' | 'binary'
  content_type?: string
}

function createRequest(method: string, pathname: string, body?: BodyInit, contentType?: string): Request {
  const headers = new Headers()
  let requestBody = body

  if (body instanceof FormData) {
    const multipartResponse = new Response(body)
    const multipartContentType = multipartResponse.headers.get('Content-Type')
    if (multipartContentType) {
      headers.set('Content-Type', multipartContentType)
    }
  } else if (contentType) {
    headers.set('Content-Type', contentType)
  }

  return new Request(`https://example.com${pathname}?key=${VALID_API_KEY}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' || method === 'DELETE' ? undefined : requestBody
  })
}

function createBinaryPayload(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => index % 128)
}

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

function createInMemoryStorageAdapter(store: Map<string, StoredEntry>): StorageAdapter {
  const toStoredData = (pathname: string): any => {
    const item = store.get(pathname)
    if (!item) {
      throw ApiError.notFound(`Data not found at path: ${pathname}`)
    }

    return {
      id: pathname,
      path: pathname,
      value: item.value,
      type: item.type,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      size: getStoredSize(item),
      content_type: item.content_type,
      storage_location: 'd1'
    }
  }

  return {
    get: jest.fn(async (pathname: string) => toStoredData(pathname)),
    upsert: jest.fn(async (pathname: string, request: StoredEntry) => {
      store.set(pathname, normalizeEntry(request))
      return toStoredData(pathname)
    }),
    create: jest.fn(async (pathname: string, request: StoredEntry) => {
      store.set(pathname, normalizeEntry(request))
      return toStoredData(pathname)
    }),
    update: jest.fn(async (pathname: string, request: StoredEntry) => {
      store.set(pathname, normalizeEntry(request))
      return toStoredData(pathname)
    }),
    delete: jest.fn(async (pathname: string) => {
      if (!store.has(pathname)) {
        throw ApiError.notFound(`Data not found at path: ${pathname}`)
      }
      store.delete(pathname)
    })
  } as unknown as StorageAdapter
}

function normalizeEntry(request: StoredEntry): StoredEntry {
  if (request.type === 'json' && typeof request.value === 'string') {
    try {
      return { ...request, value: JSON.parse(request.value) }
    } catch {
      return request
    }
  }
  return request
}

function getStoredSize(item: StoredEntry): number {
  if (item.value instanceof Uint8Array) {
    return item.value.byteLength
  }

  if (item.type === 'binary' && typeof item.value === 'string' && item.value.includes(';base64,')) {
    const [, base64] = item.value.split(';base64,')
    return Buffer.from(base64, 'base64').length
  }

  if (typeof item.value === 'string') {
    return item.value.length
  }

  return JSON.stringify(item.value).length
}

function decodeStoredBinary(store: Map<string, StoredEntry>, pathname: string): number[] {
  const item = store.get(pathname)
  if (!item || item.type !== 'binary') {
    return []
  }

  if (item.value instanceof Uint8Array) {
    return Array.from(item.value)
  }

  if (typeof item.value !== 'string') {
    return []
  }

  const [, base64] = item.value.split(';base64,')
  return Array.from(Buffer.from(base64, 'base64'))
}
