import { WorkerEnv } from '@/types'

export function createMockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    API_KEY: 'test-api-key-12345',
    ENVIRONMENT: 'test',
    VERSION: '2.0.0',
    STORAGE_BACKEND: 'd1',
    ...overrides,
  } as WorkerEnv
}

export const MOCK_AUTH_HEADER = 'Bearer test-api-key-12345'

export const VALID_API_KEY = 'test-api-key-12345'
