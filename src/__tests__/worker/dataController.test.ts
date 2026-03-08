import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DataController } from '../../api/controllers'
import { MAX_FILE_SIZE } from '../../storage/interfaces'
import { createMockEnv, VALID_API_KEY } from './mocks/env'

jest.mock('../../permissions/permissionService', () => ({
  PermissionService: jest.fn().mockImplementation(() => ({
    evaluate: jest.fn(async () => ({ allowed: true }))
  }))
}))

jest.mock('../../storage/pathMapper', () => ({
  PathMapper: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(async () => undefined),
    getFileId: jest.fn(async () => null),
    setMapping: jest.fn(async () => undefined),
    deleteMapping: jest.fn(async () => undefined),
    getPath: jest.fn(async () => null),
    listPaths: jest.fn(async () => []),
    getTotalPaths: jest.fn(async () => 0),
  })),
}))

describe('DataController file upload flow', () => {
  let createMock: ReturnType<typeof jest.fn>
  let updateMock: ReturnType<typeof jest.fn>
  let controller: DataController

  beforeEach(() => {
    createMock = jest.fn(async (_pathname: string, request: any) => ({
      id: '/files/demo.bin',
      path: '/files/demo.bin',
      value: request.value,
      type: request.type,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      size: request.value instanceof Uint8Array ? request.value.byteLength : 0,
      content_type: request.content_type,
      storage_location: 'd1'
    }))

    updateMock = jest.fn(async (_pathname: string, request: any) => ({
      id: '/files/demo.bin',
      path: '/files/demo.bin',
      value: request.value,
      type: request.type,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      size: request.value instanceof Uint8Array ? request.value.byteLength : 0,
      content_type: request.content_type,
      storage_location: 'd1'
    }))

    controller = new DataController(createMockEnv())
    ;(controller as any).storageAdapter = {
      create: createMock,
      update: updateMock,
      get: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      getStats: jest.fn()
    }
    ;(controller as any).permissionService = {
      evaluate: jest.fn(async () => ({ allowed: true }))
    }
  })

  it('sends multipart create payloads to storage adapter as raw bytes', async () => {
    const payload = createBinaryPayload(2 * 1024 * 1024)
    const request = createMultipartRequest('POST', '/._jsondb_/api/data/files/demo.bin')
    const file = new File([new Blob(['seed'])], 'demo.bin', { type: 'application/octet-stream' })
    Object.defineProperty(file, 'size', { value: payload.byteLength })
    Object.defineProperty(file, 'type', { value: 'application/octet-stream' })
    Object.defineProperty(file, 'arrayBuffer', { value: jest.fn(async () => payload.buffer.slice(0)) })
    stubFormData(request, file)

    const response = await controller.post(request)
    const body = await response.json() as any

    expect(response.status).toBe(201)
    expect(createMock).toHaveBeenCalledTimes(1)
    const [, requestPayload] = createMock.mock.calls[0] as [string, { value: Uint8Array; type: string; content_type: string }]
    expect(requestPayload.type).toBe('binary')
    expect(requestPayload.content_type).toBe('application/octet-stream')
    expect(requestPayload.value).toBeInstanceOf(Uint8Array)
    expect(Array.from(requestPayload.value)).toEqual(Array.from(payload))
    expect(body.success).toBe(true)
    expect(body.data.size).toBe(payload.byteLength)
    expect(body.data.value).toBeUndefined()
    expect(body.data.downloadable).toBe(true)
    expect(body.data.downloadPath).toBe('/files/demo.bin')
  })

  it('sends multipart update payloads to storage adapter as raw bytes', async () => {
    const payload = createBinaryPayload(1024 * 1024 + 17)
    const request = createMultipartRequest('PUT', '/._jsondb_/api/data/files/demo.bin')
    const file = new File([new Blob(['seed'])], 'demo.bin', { type: 'application/octet-stream' })
    Object.defineProperty(file, 'size', { value: payload.byteLength })
    Object.defineProperty(file, 'type', { value: 'application/octet-stream' })
    Object.defineProperty(file, 'arrayBuffer', { value: jest.fn(async () => payload.buffer.slice(0)) })
    stubFormData(request, file)

    const response = await controller.put(request)

    expect(response.status).toBe(200)
    expect(updateMock).toHaveBeenCalledTimes(1)
    const [, requestPayload] = updateMock.mock.calls[0] as [string, { value: Uint8Array; type: string; content_type: string }]
    expect(Array.from(requestPayload.value)).toEqual(Array.from(payload))
  })

  it('rejects multipart uploads larger than configured max size', async () => {
    const request = createMultipartRequest('POST', '/._jsondb_/api/data/files/too-large.bin')
    const oversized = new File([new Blob(['seed'])], 'too-large.bin', { type: 'application/octet-stream' })
    Object.defineProperty(oversized, 'size', { value: MAX_FILE_SIZE + 1 })
    Object.defineProperty(oversized, 'type', { value: 'application/octet-stream' })
    Object.defineProperty(oversized, 'arrayBuffer', { value: jest.fn(async () => new ArrayBuffer(1)) })
    stubFormData(request, oversized)

    const response = await controller.post(request)
    const body = await response.json() as any

    expect(response.status).toBe(400)
    expect(createMock).not.toHaveBeenCalled()
    expect(body.success).toBe(false)
    expect(body.error).toContain('500MB')
  })
})

function createMultipartRequest(method: 'POST' | 'PUT', pathname: string): Request {
  return new Request(`https://example.com${pathname}?key=${VALID_API_KEY}`, {
    method,
    headers: {
      'Content-Type': 'multipart/form-data; boundary=test-boundary'
    },
    body: '--test-boundary--'
  })
}

function stubFormData(request: Request, file: File): void {
  Object.defineProperty(request, 'formData', {
    value: jest.fn(async () => ({
      get: (key: string) => (key === 'file' ? file : key === 'type' ? 'binary' : null)
    }))
  })
}

function createBinaryPayload(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => index % 251)
}
