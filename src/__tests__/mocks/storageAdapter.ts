import { StoredData } from '@/storage/storageAdapter'

export function createMockStoredData(overrides: Partial<StoredData> = {}): StoredData {
  return {
    id: '/test/path',
    value: { hello: 'world' },
    type: 'json',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    size: 100,
    content_type: 'application/json',
    path: '/test/path',
    storage_location: 'd1',
    ...overrides,
  }
}

export const MOCK_JSON_DATA = createMockStoredData({
  id: '/demo_bucket/hello',
  value: { hello: 'world' },
  path: '/demo_bucket/hello',
})

export const MOCK_BINARY_DATA = createMockStoredData({
  id: '/demo_bucket/logo.svg',
  value: 'data:image/svg+xml;base64,PHN2Zy...',
  type: 'binary',
  content_type: 'image/svg+xml',
  path: '/demo_bucket/logo.svg',
})

export const MOCK_TEXT_DATA = createMockStoredData({
  id: '/demo_bucket/readme.txt',
  value: 'Hello World',
  type: 'text',
  content_type: 'text/plain',
  path: '/demo_bucket/readme.txt',
})
