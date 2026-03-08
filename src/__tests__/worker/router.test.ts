import { describe, expect, it, jest } from '@jest/globals'
import { Router } from '../../api/router'
import { createMockEnv, VALID_API_KEY } from './mocks/env'

jest.mock('../../storage/storageAdapter', () => ({
  StorageAdapter: jest.fn().mockImplementation(() => ({
    getStats: jest.fn(async () => ({ total: 0, totalSize: 0 })),
    list: jest.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, hasMore: false })),
  })),
}))

jest.mock('../../permissions/permissionService', () => ({
  PermissionService: jest.fn().mockImplementation(() => ({
    listRules: jest.fn(async () => []),
    evaluate: jest.fn(async (input: { path: string; action: string }) => ({
      path: input.path,
      action: input.action,
      allowed: false,
      access: 'private',
      mode: 'private_rw',
      matchedRule: null,
    })),
  })),
}))

jest.mock('../../permissions/permissionRepository', () => ({
  PermissionRuleRepository: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(async () => undefined),
    list: jest.fn(async () => []),
    create: jest.fn(),
    update: jest.fn(),
    setEnabled: jest.fn(),
    delete: jest.fn(),
    getById: jest.fn(),
  })),
}))

describe('Router', () => {
  it('does not expose deprecated storage endpoint in API root', async () => {
    const router = new Router(createMockEnv())
    const request = new Request('https://example.com/._jsondb_/api')

    const response = await router.handle(request)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)

    const body = await response!.json()
    expect(body.endpoints.data).toBe('/api/data')
    expect(body.endpoints.storage).toBeUndefined()
  })

  it('returns 404 for deprecated storage routes', async () => {
    const router = new Router(createMockEnv())
    const request = new Request('https://example.com/._jsondb_/api/storage')

    const response = await router.handle(request)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(404)
  })

  it('routes permission evaluation requests to the permission controller', async () => {
    const router = new Router(createMockEnv())
    const request = new Request(`https://example.com/._jsondb_/api/permissions/evaluate?key=${VALID_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/demo/file.json', action: 'read' }),
    })

    const response = await router.handle(request)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)

    const body = await response!.json() as any
    expect(body.success).toBe(true)
    expect(body.data.path).toBe('/demo/file.json')
    expect(body.data.action).toBe('read')
  })

  it('routes permission rules list requests', async () => {
    const router = new Router(createMockEnv())
    const request = new Request(`https://example.com/._jsondb_/api/permissions/rules?key=${VALID_API_KEY}`)

    const response = await router.handle(request)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)

    const body = await response!.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.items)).toBe(true)
  })
})
