import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ApiError } from '../../utils/response'
import { SystemDataAdapter } from '../../system/systemDataAdapter'
import { createMockEnv } from './mocks/env'

describe('SystemDataAdapter', () => {
  let d1Rows: Map<string, { value: string; created_at: string; updated_at: string }>
  let kvRows: Map<string, string>
  let adapter: SystemDataAdapter

  beforeEach(() => {
    d1Rows = new Map()
    kvRows = new Map()
  })

  it('writes and reads JSON system data with D1 backend', async () => {
    adapter = new SystemDataAdapter(createMockEnv({
      STORAGE_BACKEND: 'd1',
      JSONBASE_DB: createD1Mock(d1Rows),
    } as any))

    await adapter.setJson('/._system/permissions/index.json', { version: 1, items: [] })

    const result = await adapter.getJson<{ version: number; items: unknown[] }>('/._system/permissions/index.json')
    expect(result).toEqual({ version: 1, items: [] })
  })

  it('returns null when system data does not exist', async () => {
    adapter = new SystemDataAdapter(createMockEnv({
      STORAGE_BACKEND: 'd1',
      JSONBASE_DB: createD1Mock(d1Rows),
    } as any))

    await expect(adapter.getJson('/._system/permissions/missing.json')).resolves.toBeNull()
  })

  it('deletes system data and ignores missing delete for D1 backend', async () => {
    adapter = new SystemDataAdapter(createMockEnv({
      STORAGE_BACKEND: 'd1',
      JSONBASE_DB: createD1Mock(d1Rows),
    } as any))

    await adapter.setJson('/._system/permissions/index.json', { version: 1 })
    await adapter.delete('/._system/permissions/index.json')
    await adapter.delete('/._system/permissions/index.json')

    expect(d1Rows.has('/._system/permissions/index.json')).toBe(false)
  })

  it('writes and lists system data with KV backend', async () => {
    adapter = new SystemDataAdapter(createMockEnv({
      STORAGE_BACKEND: 'kv',
      JSONBIN: createKvMock(kvRows),
      JSONBIN_PREVIEW: createKvMock(kvRows),
    } as any))

    await adapter.setJson('/._system/permissions/index.json', { version: 1 })
    await adapter.setJson('/._system/permissions/rules/rule-1.json', { id: 'rule-1' })

    const result = await adapter.listJson('/._system/permissions')
    expect(result.map((item) => item.path).sort()).toEqual([
      '/._system/permissions/index.json',
      '/._system/permissions/rules/rule-1.json',
    ])
    expect(await adapter.getJson('/._system/permissions/index.json')).toEqual({ version: 1 })
  })

  it('rejects non-system paths', async () => {
    adapter = new SystemDataAdapter(createMockEnv({
      STORAGE_BACKEND: 'd1',
      JSONBASE_DB: createD1Mock(d1Rows),
    } as any))

    await expect(adapter.setJson('/public/demo.json', { ok: true })).rejects.toBeInstanceOf(ApiError)
    await expect(adapter.getJson('/public/demo.json')).rejects.toBeInstanceOf(ApiError)
  })
})

function createD1Mock(rows: Map<string, { value: string; created_at: string; updated_at: string }>) {
  return {
    prepare: (query: string) => ({
      bind: (...params: any[]) => ({
        first: async () => {
          if (query.includes('SELECT value FROM system_data_records')) {
            const row = rows.get(params[0])
            return row ? { value: row.value } : null
          }

          if (query.includes('SELECT created_at FROM system_data_records')) {
            const row = rows.get(params[0])
            return row ? { created_at: row.created_at } : null
          }

          if (query.includes('SELECT 1 as present FROM system_data_records')) {
            return rows.has(params[0]) ? { present: 1 } : null
          }

          return null
        },
        all: async () => {
          if (query.includes('FROM system_data_records')) {
            const exact = params[0]
            const prefix = String(params[1] || '').replace(/%$/, '')
            return {
              results: Array.from(rows.entries())
                .filter(([path]) => path === exact || path.startsWith(prefix))
                .map(([path, row]) => ({ path, ...row }))
            }
          }

          return { results: [] }
        },
        run: async () => {
          if (query.includes('INSERT OR REPLACE INTO system_data_records')) {
            rows.set(params[0], {
              value: params[1],
              created_at: params[2],
              updated_at: params[3],
            })
          }

          if (query.includes('DELETE FROM system_data_records')) {
            rows.delete(params[0])
          }

          return { success: true }
        },
      }),
      run: async () => ({ success: true }),
    }),
  }
}

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
        .filter((key) => key.startsWith(prefix) && !key.endsWith(':__metadata__'))
        .map((name) => ({ name })),
    }),
  }
}
