import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ApiError } from '../../utils/response'
import { SystemDataAdapter } from '../../system/systemDataAdapter'
import { createMockEnv } from './mocks/env'

describe('SystemDataAdapter', () => {
  let store = new Map<string, any>()
  let storageAdapter: {
    get: ReturnType<typeof jest.fn>
    upsert: ReturnType<typeof jest.fn>
    delete: ReturnType<typeof jest.fn>
  }
  let adapter: SystemDataAdapter

  beforeEach(() => {
    store = new Map()
    storageAdapter = {
      get: jest.fn(async (path: string) => {
        if (!store.has(path)) {
          throw ApiError.notFound('missing')
        }
        return store.get(path)
      }),
      upsert: jest.fn(async (path: string, request: any) => {
        store.set(path, {
          id: path,
          path,
          type: request.type,
          value: request.value,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          size: JSON.stringify(request.value).length,
          content_type: request.content_type,
          storage_location: 'd1',
        })
      }),
      delete: jest.fn(async (path: string) => {
        if (!store.has(path)) {
          throw ApiError.notFound('missing')
        }
        store.delete(path)
      }),
    }

    adapter = new SystemDataAdapter(createMockEnv(), storageAdapter as any)
  })

  it('writes and reads JSON system data', async () => {
    await adapter.setJson('/._system/permissions/index.json', { version: 1, items: [] })

    const result = await adapter.getJson<{ version: number; items: unknown[] }>('/._system/permissions/index.json')
    expect(result).toEqual({ version: 1, items: [] })
  })

  it('returns null when system data does not exist', async () => {
    await expect(adapter.getJson('/._system/permissions/missing.json')).resolves.toBeNull()
  })

  it('deletes system data and ignores missing delete', async () => {
    await adapter.setJson('/._system/permissions/index.json', { version: 1 })
    await adapter.delete('/._system/permissions/index.json')
    await adapter.delete('/._system/permissions/index.json')

    expect(store.has('/._system/permissions/index.json')).toBe(false)
  })

  it('rejects non-system paths', async () => {
    await expect(adapter.setJson('/public/demo.json', { ok: true })).rejects.toBeInstanceOf(ApiError)
    await expect(adapter.getJson('/public/demo.json')).rejects.toBeInstanceOf(ApiError)
  })
})
