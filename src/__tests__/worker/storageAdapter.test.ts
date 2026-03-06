import { describe, expect, it } from '@jest/globals'
import { StorageAdapter } from '../../storage/storageAdapter'

describe('StorageAdapter binary normalization', () => {
  it('accepts Uint8Array payloads for binary create without converting to text', async () => {
    const written: { data?: Uint8Array; contentType?: string } = {}
    const adapter = createAdapterForBinaryTest(written)
    const payload = Uint8Array.from([1, 2, 3, 4, 255])

    const result = await adapter.create('/files/raw.bin', {
      value: payload,
      type: 'binary',
      content_type: 'application/octet-stream'
    })

    expect(written.data).toBeDefined()
    expect(Array.from(written.data as Uint8Array)).toEqual(Array.from(payload))
    expect(written.contentType).toBe('application/octet-stream')
    expect(result.size).toBe(payload.byteLength)
    expect(result.content_type).toBe('application/octet-stream')
  })

  it('accepts ArrayBuffer view payloads for binary create', async () => {
    const written: { data?: Uint8Array } = {}
    const adapter = createAdapterForBinaryTest(written)
    const source = Uint8Array.from([9, 8, 7, 6, 5, 4])
    const view = new Uint8Array(source.buffer, 1, 3)

    await adapter.create('/files/view.bin', {
      value: view,
      type: 'binary',
      content_type: 'application/octet-stream'
    })

    expect(Array.from(written.data as Uint8Array)).toEqual([8, 7, 6])
  })
})

function createAdapterForBinaryTest(capture: { data?: Uint8Array; contentType?: string }) {
  const adapter = new StorageAdapter({ env: {} as any })

  ;(adapter as any).initialized = true
  ;(adapter as any).pathMapper = {
    getFileId: async () => null,
    setMapping: async () => undefined
  }
  ;(adapter as any).storageService = {
    write: async (data: Uint8Array, options: { contentType?: string }) => {
      capture.data = data
      capture.contentType = options.contentType
      return {
        success: true,
        fileId: 'file-1',
        metadata: {
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          storageBackend: 'd1'
        }
      }
    }
  }

  return adapter
}
