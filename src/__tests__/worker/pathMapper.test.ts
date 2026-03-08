import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { D1Database } from '@cloudflare/workers-types'
import { PathMapper } from '../../storage/pathMapper'
import { createMockEnv } from './mocks/env'

describe('PathMapper', () => {
  let store: Map<string, any>
  let adapter: {
    getJson: ReturnType<typeof jest.fn>
    setJson: ReturnType<typeof jest.fn>
    delete: ReturnType<typeof jest.fn>
  }

  beforeEach(() => {
    store = new Map()
    adapter = {
      getJson: jest.fn(async (path: string) => store.get(path) ?? null),
      setJson: jest.fn(async (path: string, value: unknown) => {
        store.set(path, value)
      }),
      delete: jest.fn(async (path: string) => {
        store.delete(path)
      }),
    }
  })

  it('stores mappings in system index and record files', async () => {
    const mapper = new PathMapper(createMockEnv(), adapter as any)

    await mapper.setMapping('/demo/file.json', 'file-1')

    expect(await mapper.getFileId('/demo/file.json')).toBe('file-1')
    expect(await mapper.getPath('file-1')).toBe('/demo/file.json')

    const list = await mapper.listPaths(20, 0)
    expect(list).toEqual([
      {
        path: '/demo/file.json',
        file_id: 'file-1',
        created_at: expect.any(String),
      },
    ])
  })

  it('deletes mappings from system index and record files', async () => {
    const mapper = new PathMapper(createMockEnv(), adapter as any)

    await mapper.setMapping('/demo/file.json', 'file-1')
    await mapper.deleteMapping('/demo/file.json')

    expect(await mapper.getFileId('/demo/file.json')).toBeNull()
    expect(await mapper.getTotalPaths()).toBe(0)
  })

  it('migrates legacy D1 path mappings into system storage', async () => {
    const db = {
      prepare: jest.fn(() => ({
        all: jest.fn(async () => ({
          results: [
            {
              path: '/legacy/file.json',
              file_id: 'legacy-file',
              created_at: '2024-01-01T00:00:00.000Z',
            },
          ],
        })),
      })),
    } as unknown as D1Database

    const mapper = new PathMapper(createMockEnv({ JSONBASE_DB: db } as any), adapter as any)
    await mapper.initialize()

    expect(await mapper.getFileId('/legacy/file.json')).toBe('legacy-file')
    expect(adapter.setJson).toHaveBeenCalled()
  })
})
