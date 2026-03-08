import { beforeEach, describe, expect, it } from '@jest/globals'
import { PermissionRuleRepository } from '../../permissions/permissionRepository'
import { PathMapper } from '../../storage/pathMapper'
import { SystemDataAdapter } from '../../system/systemDataAdapter'
import { createMockEnv } from './mocks/env'

describe('KV backend system data integration', () => {
  let kvRows: Map<string, string>

  beforeEach(() => {
    kvRows = new Map()
  })

  it('stores permission rules in KV-backed system adapter and supports repository queries', async () => {
    const env = createMockEnv({
      STORAGE_BACKEND: 'kv',
      JSONBIN: createKvMock(kvRows),
      JSONBIN_PREVIEW: createKvMock(kvRows),
    } as any)

    const repository = new PermissionRuleRepository(env)

    const created = await repository.create({
      pattern: '/kv-public/**',
      mode: 'public_rw',
      priority: 120,
      enabled: true,
      description: 'kv rule',
    })

    const listed = await repository.list({ enabled: true })
    const fetched = await repository.getById(created.id)

    expect(created.pattern).toBe('/kv-public/**')
    expect(fetched?.id).toBe(created.id)
    expect(listed.some((rule) => rule.id === created.id)).toBe(true)

    expect(Array.from(kvRows.keys())).toEqual(expect.arrayContaining([
      'system:data:/._system/permissions/index.json',
      `system:data:/._system/permissions/rules/${created.id}.json`,
      'system:meta:/._system/permissions/index.json',
      `system:meta:/._system/permissions/rules/${created.id}.json`,
    ]))
  })

  it('stores and updates path mappings through KV-backed system adapter', async () => {
    const env = createMockEnv({
      STORAGE_BACKEND: 'kv',
      JSONBIN: createKvMock(kvRows),
      JSONBIN_PREVIEW: createKvMock(kvRows),
    } as any)

    const mapper = new PathMapper(env)

    await mapper.setMapping('/kv/demo.json', 'file-kv-1')

    expect(await mapper.getFileId('/kv/demo.json')).toBe('file-kv-1')
    expect(await mapper.getPath('file-kv-1')).toBe('/kv/demo.json')
    expect(await mapper.getTotalPaths()).toBe(1)

    const list = await mapper.listPaths(20, 0)
    expect(list[0].path).toBe('/kv/demo.json')

    expect(Array.from(kvRows.keys())).toEqual(expect.arrayContaining([
      'system:data:/._system/path-mappings/index.json',
      'system:data:/._system/path-mappings/records/%2Fkv%2Fdemo.json.json',
      'system:meta:/._system/path-mappings/index.json',
      'system:meta:/._system/path-mappings/records/%2Fkv%2Fdemo.json.json',
    ]))
  })

  it('lets SystemDataAdapter enumerate KV-backed system records by prefix', async () => {
    const env = createMockEnv({
      STORAGE_BACKEND: 'kv',
      JSONBIN: createKvMock(kvRows),
      JSONBIN_PREVIEW: createKvMock(kvRows),
    } as any)

    const adapter = new SystemDataAdapter(env)

    await adapter.setJson('/._system/permissions/index.json', { version: 1, items: [] })
    await adapter.setJson('/._system/permissions/rules/rule-a.json', { id: 'rule-a', priority: 10 })
    await adapter.setJson('/._system/path-mappings/index.json', { version: 1, items: [] })

    const permissionItems = await adapter.listJson('/._system/permissions')
    const mappingItems = await adapter.listJson('/._system/path-mappings')

    expect(permissionItems.map((item) => item.path).sort()).toEqual([
      '/._system/permissions/index.json',
      '/._system/permissions/rules/rule-a.json',
    ])
    expect(mappingItems.map((item) => item.path)).toEqual(['/._system/path-mappings/index.json'])
  })
})

function createKvMock(rows: Map<string, string>) {
  return {
    get: async (key: string) => rows.get(key) ?? null,
    put: async (key: string, value: string) => {
      rows.set(key, value)
    },
    delete: async (key: string) => {
      rows.delete(key)
    },
    list: async ({ prefix }: { prefix: string }) => ({
      keys: Array.from(rows.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    }),
  }
}
