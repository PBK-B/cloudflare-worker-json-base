import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DataController } from '../../api/controllers'
import { createMockEnv, VALID_API_KEY } from './mocks/env'
import { PermissionService } from '../../permissions/permissionService'

jest.mock('../../permissions/permissionService', () => ({
  PermissionService: jest.fn().mockImplementation(() => ({
    evaluate: jest.fn(async () => ({ allowed: true }))
  }))
}))

describe('DataController permission enforcement', () => {
  let controller: DataController
  let evaluateMock: ReturnType<typeof jest.fn>
  let storageAdapter: {
    get: ReturnType<typeof jest.fn>
    create: ReturnType<typeof jest.fn>
    update: ReturnType<typeof jest.fn>
    delete: ReturnType<typeof jest.fn>
    list: ReturnType<typeof jest.fn>
    getStats: ReturnType<typeof jest.fn>
  }

  beforeEach(() => {
    controller = new DataController(createMockEnv())
    const permissionServiceResults = (PermissionService as unknown as jest.Mock).mock.results
    const latestPermissionService = permissionServiceResults[permissionServiceResults.length - 1]?.value as { evaluate?: ReturnType<typeof jest.fn> } | undefined
    evaluateMock = latestPermissionService?.evaluate || jest.fn()

    storageAdapter = {
      get: jest.fn(async (pathname: string) => ({
        id: pathname,
        path: pathname,
        value: { ok: true },
        type: 'json',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        size: 10,
        content_type: 'application/json',
        storage_location: 'd1',
      })),
      create: jest.fn(async (pathname: string, request: any) => ({
        id: pathname,
        path: pathname,
        value: request.value,
        type: request.type || 'json',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        size: 10,
        content_type: 'application/json',
        storage_location: 'd1',
      })),
      update: jest.fn(async (pathname: string, request: any) => ({
        id: pathname,
        path: pathname,
        value: request.value,
        type: request.type || 'json',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        size: 10,
        content_type: 'application/json',
        storage_location: 'd1',
      })),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, hasMore: false })),
      getStats: jest.fn(async () => ({ total: 0, totalSize: 0 })),
    }

    ;(controller as any).storageAdapter = storageAdapter
  })

  it('allows public reads without auth when permission service permits', async () => {
    evaluateMock.mockResolvedValue({ allowed: true, mode: 'public_rw', matchedRule: null })

    const response = await controller.get(new Request('https://example.com/._jsondb_/api/data/public/demo.json'))
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(storageAdapter.get).toHaveBeenCalledWith('/public/demo.json')
  })

  it('rejects private reads without auth', async () => {
    evaluateMock.mockResolvedValue({ allowed: false, mode: 'private_rw', matchedRule: null })

    const response = await controller.get(new Request('https://example.com/._jsondb_/api/data/private/demo.json'))
    const body = await response.json() as any

    expect(response.status).toBe(401)
    expect(body.success).toBe(false)
    expect(storageAdapter.get).not.toHaveBeenCalled()
  })

  it('allows private reads with valid auth', async () => {
    evaluateMock.mockResolvedValue({ allowed: false, mode: 'private_rw', matchedRule: null })

    const response = await controller.get(new Request(`https://example.com/._jsondb_/api/data/private/demo.json?key=${VALID_API_KEY}`))

    expect(response.status).toBe(200)
    expect(storageAdapter.get).toHaveBeenCalledWith('/private/demo.json')
  })

  it('allows public writes without auth when permission service permits', async () => {
    evaluateMock.mockResolvedValue({ allowed: true, mode: 'private_read_public_write', matchedRule: null })

    const response = await controller.post(new Request('https://example.com/._jsondb_/api/data/uploads/demo.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: { ok: true }, type: 'json' }),
    }))

    expect(response.status).toBe(201)
    expect(storageAdapter.create).toHaveBeenCalledWith('/uploads/demo.json', {
      value: { ok: true },
      type: 'json',
    })
  })

  it('rejects private writes without auth', async () => {
    evaluateMock.mockResolvedValue({ allowed: false, mode: 'public_read_private_write', matchedRule: null })

    const response = await controller.post(new Request('https://example.com/._jsondb_/api/data/secure/demo.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: { ok: true }, type: 'json' }),
    }))

    expect(response.status).toBe(401)
    expect(storageAdapter.create).not.toHaveBeenCalled()
  })

  it('allows private writes when valid auth is present', async () => {
    evaluateMock.mockResolvedValue({ allowed: false, mode: 'private_rw', matchedRule: null })

    const putResponse = await controller.put(new Request(`https://example.com/._jsondb_/api/data/secure/demo.json?key=${VALID_API_KEY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: { ok: 'updated' }, type: 'json' }),
    }))
    const deleteResponse = await controller.delete(new Request(`https://example.com/._jsondb_/api/data/secure/demo.json?key=${VALID_API_KEY}`, {
      method: 'DELETE',
    }))

    expect(putResponse.status).toBe(200)
    expect(deleteResponse.status).toBe(204)
    expect(storageAdapter.update).toHaveBeenCalled()
    expect(storageAdapter.delete).toHaveBeenCalledWith('/secure/demo.json')
  })

  it('keeps list endpoint private regardless of permission rules', async () => {
    const response = await controller.list(new Request('https://example.com/._jsondb_/api/data'))

    expect(response.status).toBe(401)
    expect(storageAdapter.list).not.toHaveBeenCalled()
  })
})
