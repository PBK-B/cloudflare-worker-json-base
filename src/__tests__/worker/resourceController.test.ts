import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Buffer } from 'node:buffer'
import { ResourceController } from '../../api/resourceController'
import { createMockEnv, VALID_API_KEY } from './mocks/env'
import { ApiError } from '../../utils/response'
import { StorageAdapter } from '../../storage/storageAdapter'
import { PermissionService } from '../../permissions/permissionService'

jest.mock('../../permissions/permissionService', () => ({
  PermissionService: jest.fn().mockImplementation(() => ({
    evaluate: jest.fn(async () => ({ allowed: true }))
  }))
}))

describe('资源控制器', () => {
  let mockEnv: ReturnType<typeof createMockEnv>
  let store: Map<string, StoredEntry>
  let controller: ResourceController
  let evaluateMock: ReturnType<typeof jest.fn>

  beforeEach(() => {
    mockEnv = createMockEnv()
    store = new Map<string, StoredEntry>()
    controller = new ResourceController(mockEnv, createInMemoryStorageAdapter(store))
    const permissionServiceResults = (PermissionService as unknown as jest.Mock).mock.results
    const latestPermissionService = permissionServiceResults[permissionServiceResults.length - 1]?.value as { evaluate?: ReturnType<typeof jest.fn> } | undefined
    evaluateMock = latestPermissionService?.evaluate || jest.fn()
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

    it('应该对系统路径返回 null', async () => {
      const request = createRequest('GET', '/._system/permissions/index.json')
      const response = await controller.handle(request)
      expect(response).toBeNull()
    })

    it('应该对不支持的方法返回 405', async () => {
      const request = createRequest('PATCH', '/demo_bucket/test')
      const response = await controller.handle(request)
      expect(response).not.toBeNull()
      expect(response!.status).toBe(405)
    })

		it('应该对 OPTIONS 请求返回预检响应', async () => {
			const request = new Request('https://example.com/demo_bucket/test', {
				method: 'OPTIONS',
				headers: { Origin: 'https://client.example.com' },
			})
			const response = await controller.handle(request)
			expect(response).not.toBeNull()
			expect(response!.status).toBe(204)
			expect(response!.headers.get('Access-Control-Allow-Origin')).toBe('https://client.example.com')
		})
  })

	describe('权限控制', () => {
		it('公开读路径在未鉴权时允许 GET 和 HEAD', async () => {
			evaluateMock.mockResolvedValue({ allowed: true, mode: 'public_rw', matchedRule: null })

			store.set('/public/readme.txt', { value: 'hello', type: 'text', content_type: 'text/plain' })

			const getResponse = await controller.handle(new Request('https://example.com/public/readme.txt'))
			const headResponse = await controller.handle(new Request('https://example.com/public/readme.txt', { method: 'HEAD' }))

			expect(getResponse!.status).toBe(200)
			expect(await getResponse!.text()).toBe('hello')
			expect(headResponse!.status).toBe(200)
		})

		it('私有读路径在未鉴权时拒绝 GET', async () => {
			evaluateMock.mockResolvedValue({ allowed: false, mode: 'private_rw', matchedRule: null })

			store.set('/private/readme.txt', { value: 'secret', type: 'text', content_type: 'text/plain' })

			const response = await controller.handle(new Request('https://example.com/private/readme.txt'))

			expect(response!.status).toBe(401)
		})

		it('公有写路径在未鉴权时允许 POST 和 PUT', async () => {
			evaluateMock.mockResolvedValue({ allowed: true, mode: 'private_read_public_write', matchedRule: null })

			const postResponse = await controller.handle(
				new Request('https://example.com/uploads/demo.txt', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' })
			)
			const putResponse = await controller.handle(
				new Request('https://example.com/uploads/demo.txt', { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'updated' })
			)

			expect(postResponse!.status).toBe(201)
			expect(putResponse!.status).toBe(200)
		})

		it('私有写路径在未鉴权时拒绝 POST 和 DELETE', async () => {
			evaluateMock.mockResolvedValue({ allowed: false, mode: 'public_read_private_write', matchedRule: null })

			const postResponse = await controller.handle(
				new Request('https://example.com/private-write/demo.txt', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' })
			)
			const deleteResponse = await controller.handle(
				new Request('https://example.com/private-write/demo.txt', { method: 'DELETE' })
			)

			expect(postResponse!.status).toBe(401)
			expect(deleteResponse!.status).toBe(401)
		})

		it('私有路径在鉴权后允许访问', async () => {
			evaluateMock.mockResolvedValue({ allowed: false, mode: 'private_rw', matchedRule: null })
			store.set('/private/data.json', { value: { ok: true }, type: 'json', content_type: 'application/json' })

			const request = new Request(`https://example.com/private/data.json?key=${VALID_API_KEY}`)
			const response = await controller.handle(request)

			expect(response!.status).toBe(200)
			expect(await response!.json()).toEqual({ ok: true })
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
