import { describe, expect, it } from '@jest/globals'
import { Router } from '../../api/router'
import { createMockEnv } from './mocks/env'

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
})
