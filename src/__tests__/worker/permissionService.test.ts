import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ApiError } from '../../utils/response'
import { PermissionRule, PermissionRuleInput } from '../../types'
import {
  isActionPublic,
  matchPermissionPattern,
  normalizePermissionPath,
  permissionModeToAccess,
} from '../../permissions/permissionMatcher'
import { PermissionService } from '../../permissions/permissionService'
import { createMockEnv } from './mocks/env'

describe('permissionMatcher', () => {
  it('normalizes leading and trailing slashes', () => {
    expect(normalizePermissionPath('public/demo/')).toBe('/public/demo')
    expect(normalizePermissionPath('/public//demo')).toBe('/public/demo')
  })

  it('matches exact paths and single-level wildcard with *', () => {
    expect(matchPermissionPattern('/public/logo.png', '/public/logo.png')).toBe(true)
    expect(matchPermissionPattern('/public/*', '/public/logo.png')).toBe(true)
    expect(matchPermissionPattern('/public/*', '/public/assets/logo.png')).toBe(false)
  })

  it('matches multi-level wildcard with ** and suffix patterns', () => {
    expect(matchPermissionPattern('/public/**', '/public/assets/logo.png')).toBe(true)
    expect(matchPermissionPattern('/**/*.png', '/public/assets/logo.png')).toBe(true)
    expect(matchPermissionPattern('/docs/**/index.json', '/docs/a/b/index.json')).toBe(true)
  })

  it('supports ? and character classes within a path segment', () => {
    expect(matchPermissionPattern('/images/file-?.png', '/images/file-a.png')).toBe(true)
    expect(matchPermissionPattern('/images/file-[ab].png', '/images/file-b.png')).toBe(true)
    expect(matchPermissionPattern('/images/file-[ab].png', '/images/file-c.png')).toBe(false)
  })

  it('maps modes to read/write access', () => {
    expect(permissionModeToAccess('private_rw')).toEqual({ read: 'private', write: 'private' })
    expect(permissionModeToAccess('public_rw')).toEqual({ read: 'public', write: 'public' })
    expect(permissionModeToAccess('private_read_public_write')).toEqual({ read: 'private', write: 'public' })
    expect(permissionModeToAccess('public_read_private_write')).toEqual({ read: 'public', write: 'private' })
  })

  it('returns public access only for allowed actions', () => {
    expect(isActionPublic('public_rw', 'read')).toBe(true)
    expect(isActionPublic('private_read_public_write', 'read')).toBe(false)
    expect(isActionPublic('private_read_public_write', 'write')).toBe(true)
    expect(isActionPublic('public_read_private_write', 'write')).toBe(false)
  })
})

describe('PermissionService', () => {
  let rules: PermissionRule[]
  let repository: ReturnType<typeof createRepositoryMock>
  let service: PermissionService

  beforeEach(() => {
    rules = []
    repository = createRepositoryMock(rules)
    service = new PermissionService(createMockEnv(), repository as any)
  })

  it('returns default private access when no rule matches', async () => {
    const decision = await service.evaluate({ path: '/unknown/path.json', action: 'read' })

    expect(decision.path).toBe('/unknown/path.json')
    expect(decision.allowed).toBe(false)
    expect(decision.access).toBe('private')
    expect(decision.mode).toBe('private_rw')
    expect(decision.matchedRule).toBeNull()
  })

  it('uses highest-priority enabled rule from repository ordering', async () => {
    rules.push(
      createRule({ id: 'low', pattern: '/docs/**', mode: 'private_rw', priority: 10 }),
      createRule({ id: 'high', pattern: '/docs/special/**', mode: 'public_rw', priority: 200 }),
      createRule({ id: 'disabled', pattern: '/docs/special/**', mode: 'private_rw', priority: 300, enabled: false }),
    )

    const decision = await service.evaluate({ path: '/docs/special/page.json', action: 'read' })

    expect(decision.allowed).toBe(true)
    expect(decision.mode).toBe('public_rw')
    expect(decision.matchedRule?.id).toBe('high')
    expect(repository.list).toHaveBeenCalledWith({ enabled: true })
  })

  it('normalizes paths before matching', async () => {
    rules.push(createRule({ pattern: '/docs/**', mode: 'public_rw', priority: 20 }))

    const decision = await service.evaluate({ path: 'docs/example.json/', action: 'read' })

    expect(decision.path).toBe('/docs/example.json')
    expect(decision.allowed).toBe(true)
  })

  it('enforces write-only public access correctly', async () => {
    rules.push(createRule({ pattern: '/uploads/**', mode: 'private_read_public_write', priority: 100 }))

    const readDecision = await service.evaluate({ path: '/uploads/file.json', action: 'read' })
    const writeDecision = await service.evaluate({ path: '/uploads/file.json', action: 'write' })

    expect(readDecision.allowed).toBe(false)
    expect(readDecision.access).toBe('private')
    expect(writeDecision.allowed).toBe(true)
    expect(writeDecision.access).toBe('public')
  })

  it('assertAccess throws forbidden for private paths and allows public paths', async () => {
    rules.push(createRule({ pattern: '/public/**', mode: 'public_rw', priority: 100 }))

    await expect(service.assertAccess('/public/readme.txt', 'read')).resolves.toBeUndefined()
    await expect(service.assertAccess('/secret/readme.txt', 'read')).rejects.toBeInstanceOf(ApiError)
  })

  it('validates rule input before create and update', async () => {
    await expect(service.createRule({ pattern: '/', mode: 'public_rw', priority: 1 })).rejects.toBeInstanceOf(ApiError)
    await expect(service.createRule({ pattern: '/demo', mode: 'invalid_mode' as any, priority: 1 })).rejects.toBeInstanceOf(ApiError)
    await expect(service.createRule({ pattern: '/demo', mode: 'public_rw', priority: Number.NaN })).rejects.toBeInstanceOf(ApiError)

    rules.push(createRule({ id: 'existing', pattern: '/demo/**', mode: 'private_rw', priority: 1 }))
    await service.updateRule('existing', {
      pattern: 'demo/**/',
      mode: 'public_rw',
      priority: 8.9,
      enabled: false,
      description: '  normalized description  ',
    })

    expect(repository.update).toHaveBeenCalledWith('existing', {
      pattern: '/demo/**',
      mode: 'public_rw',
      priority: 8,
      enabled: false,
      description: 'normalized description',
    })
  })

  it('validates evaluation input', async () => {
    await expect(service.evaluate({ path: '', action: 'read' })).rejects.toBeInstanceOf(ApiError)
    await expect(service.evaluate({ path: '/demo', action: 'delete' as any })).rejects.toBeInstanceOf(ApiError)
  })

  it('delegates enable, disable, delete, and list to repository after initialization', async () => {
    rules.push(createRule({ id: 'rule-1', pattern: '/demo/**', mode: 'private_rw', priority: 1 }))

    await service.listRules({ search: 'demo' })
    await service.setRuleEnabled('rule-1', false)
    await service.deleteRule('rule-1')

    expect(repository.initialize).toHaveBeenCalledTimes(1)
    expect(repository.list).toHaveBeenNthCalledWith(1, { search: 'demo' })
    expect(repository.setEnabled).toHaveBeenCalledWith('rule-1', false)
    expect(repository.delete).toHaveBeenCalledWith('rule-1')
  })
})

function createRule(overrides: Partial<PermissionRule> = {}): PermissionRule {
  return {
    id: overrides.id || crypto.randomUUID(),
    pattern: overrides.pattern || '/demo/**',
    mode: overrides.mode || 'private_rw',
    priority: overrides.priority ?? 0,
    enabled: overrides.enabled ?? true,
    description: overrides.description,
    created_at: overrides.created_at || '2024-01-01T00:00:00.000Z',
    updated_at: overrides.updated_at || '2024-01-01T00:00:00.000Z',
  }
}

function createRepositoryMock(initialRules: PermissionRule[]) {
  const rules = initialRules

  const list = jest.fn(async (filters: { enabled?: boolean; search?: string } = {}) => {
    let result = [...rules]
    if (typeof filters.enabled === 'boolean') {
      result = result.filter((rule) => rule.enabled === filters.enabled)
    }
    if (filters.search) {
      result = result.filter((rule) => rule.pattern.includes(filters.search!) || (rule.description || '').includes(filters.search!))
    }
    return result.sort((a, b) => b.priority - a.priority)
  })

  return {
    initialize: jest.fn(async () => undefined),
    list,
    create: jest.fn(async (input: PermissionRuleInput) => {
      const rule = createRule({ ...input, id: 'created-rule' })
      rules.unshift(rule)
      return rule
    }),
    update: jest.fn(async (id: string, input: PermissionRuleInput) => {
      const index = rules.findIndex((rule) => rule.id === id)
      if (index === -1) {
        throw ApiError.notFound('Permission rule not found')
      }
      const updated = {
        ...rules[index],
        ...input,
        updated_at: '2024-01-02T00:00:00.000Z',
      }
      rules[index] = updated
      return updated
    }),
    setEnabled: jest.fn(async (id: string, enabled: boolean) => {
      const index = rules.findIndex((rule) => rule.id === id)
      if (index === -1) {
        throw ApiError.notFound('Permission rule not found')
      }
      rules[index] = {
        ...rules[index],
        enabled,
        updated_at: '2024-01-02T00:00:00.000Z',
      }
      return rules[index]
    }),
    delete: jest.fn(async (id: string) => {
      const index = rules.findIndex((rule) => rule.id === id)
      if (index >= 0) {
        rules.splice(index, 1)
      }
    }),
  }
}
