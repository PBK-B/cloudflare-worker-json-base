import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { PermissionController } from '../../api/permissionController'
import { createMockEnv, VALID_API_KEY } from './mocks/env'
import { PermissionService } from '../../permissions/permissionService'

jest.mock('../../permissions/permissionService', () => ({
  PermissionService: jest.fn().mockImplementation(() => ({
    listRules: jest.fn(async () => []),
    createRule: jest.fn(async (input: any) => ({ id: 'rule-1', ...input, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' })),
    updateRule: jest.fn(async (id: string, input: any) => ({ id, ...input, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-02T00:00:00.000Z' })),
    setRuleEnabled: jest.fn(async (id: string, enabled: boolean) => ({ id, enabled, pattern: '/demo/**', mode: 'public_rw', priority: 1, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-02T00:00:00.000Z' })),
    deleteRule: jest.fn(async () => undefined),
    evaluate: jest.fn(async (input: any) => ({ path: input.path, action: input.action, allowed: true, access: 'public', mode: 'public_rw', matchedRule: null })),
  }))
}))

describe('PermissionController', () => {
  let controller: PermissionController
  let serviceMock: {
    listRules: ReturnType<typeof jest.fn>
    createRule: ReturnType<typeof jest.fn>
    updateRule: ReturnType<typeof jest.fn>
    setRuleEnabled: ReturnType<typeof jest.fn>
    deleteRule: ReturnType<typeof jest.fn>
    evaluate: ReturnType<typeof jest.fn>
  }

  beforeEach(() => {
    controller = new PermissionController(createMockEnv())
    const instances = (PermissionService as unknown as jest.Mock).mock.results
    serviceMock = instances[instances.length - 1]?.value as typeof serviceMock
  })

  it('lists rules with enabled and search filters', async () => {
    const response = await controller.list(new Request(`https://example.com/._jsondb_/api/permissions/rules?enabled=true&search=demo&key=${VALID_API_KEY}`))
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(serviceMock.listRules).toHaveBeenCalledWith({ enabled: true, search: 'demo' })
  })

  it('creates a rule from request body', async () => {
    const response = await controller.create(new Request(`https://example.com/._jsondb_/api/permissions/rules?key=${VALID_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: '/demo/**', mode: 'public_rw', priority: 10, enabled: true, description: 'demo' }),
    }))

    expect(response.status).toBe(201)
    expect(serviceMock.createRule).toHaveBeenCalledWith({ pattern: '/demo/**', mode: 'public_rw', priority: 10, enabled: true, description: 'demo' })
  })

  it('rejects create when required fields are missing', async () => {
    const response = await controller.create(new Request(`https://example.com/._jsondb_/api/permissions/rules?key=${VALID_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: '/demo/**' }),
    }))
    const body = await response.json() as any

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(serviceMock.createRule).not.toHaveBeenCalled()
  })

  it('updates a rule by id', async () => {
    const response = await controller.update(new Request(`https://example.com/._jsondb_/api/permissions/rules/rule-1?key=${VALID_API_KEY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: '/demo/**', mode: 'private_rw', priority: 9, enabled: false, description: 'updated' }),
    }), 'rule-1')

    expect(response.status).toBe(200)
    expect(serviceMock.updateRule).toHaveBeenCalledWith('rule-1', { pattern: '/demo/**', mode: 'private_rw', priority: 9, enabled: false, description: 'updated' })
  })

  it('updates rule status and rejects invalid enabled payload', async () => {
    const okResponse = await controller.setStatus(new Request(`https://example.com/._jsondb_/api/permissions/rules/rule-1/status?key=${VALID_API_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    }), 'rule-1')

    expect(okResponse.status).toBe(200)
    expect(serviceMock.setRuleEnabled).toHaveBeenCalledWith('rule-1', false)

    const badResponse = await controller.setStatus(new Request(`https://example.com/._jsondb_/api/permissions/rules/rule-1/status?key=${VALID_API_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes' }),
    }), 'rule-1')

    expect(badResponse.status).toBe(400)
  })

  it('deletes a rule', async () => {
    const response = await controller.delete(new Request(`https://example.com/._jsondb_/api/permissions/rules/rule-1?key=${VALID_API_KEY}`, {
      method: 'DELETE',
    }), 'rule-1')

    expect(response.status).toBe(204)
    expect(serviceMock.deleteRule).toHaveBeenCalledWith('rule-1')
  })

  it('evaluates access for a given path and action', async () => {
    const response = await controller.evaluate(new Request(`https://example.com/._jsondb_/api/permissions/evaluate?key=${VALID_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/demo/readme.txt', action: 'read' }),
    }))
    const body = await response.json() as any

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(serviceMock.evaluate).toHaveBeenCalledWith({ path: '/demo/readme.txt', action: 'read' })
  })
})
