import React from 'react'
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { jest, describe, expect, it, beforeEach } from '@jest/globals'

jest.mock('axios-hooks', () => ({
  configure: jest.fn()
}))

const postMock = jest.fn()
const putMock = jest.fn()

jest.mock('axios', () => {
  const create = jest.fn(() => ({
    post: postMock,
    get: jest.fn(),
    put: putMock,
    delete: jest.fn(),
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  }))

  return {
    __esModule: true,
    default: {
      create,
      isAxiosError: jest.fn(() => false)
    },
    isAxiosError: jest.fn(() => false)
  }
})

const localStorageMock = {
  getItem: jest.fn(() => 'test-api-key'),
  setItem: jest.fn(),
  removeItem: jest.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
})

describe('useApi uploadFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    postMock.mockImplementation(async () => ({
      data: {
        success: true,
        data: { id: '/files/demo.txt' },
        timestamp: new Date().toISOString()
      }
    }))
    putMock.mockImplementation(async () => ({
      data: {
        success: true,
        data: { id: '/files/demo.txt' },
        timestamp: new Date().toISOString()
      }
    }))
  })

  it('posts binary uploads to the data API with FormData', async () => {
    let uploadPromise: Promise<unknown> | null = null

    const TestComponent = () => {
      const { useApi } = require('../../hooks/useApi') as typeof import('../../hooks/useApi')
      const api = useApi()

      React.useEffect(() => {
        const file = new File(['hello'], 'demo.txt', { type: 'text/plain' })
        uploadPromise = api.uploadFile('/files/demo.txt', file, file.type)
      }, [api])

      return null
    }

    render(<TestComponent />)

    await waitFor(() => expect(postMock).toHaveBeenCalled())

    const [url, body] = postMock.mock.calls[0] as [string, FormData]
    expect(url).toBe('/data/files/demo.txt')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('type')).toBe('binary')
    expect((body as FormData).get('file')).toBeInstanceOf(File)

    await uploadPromise
  })

  it('puts binary replacements to the data API with FormData', async () => {
    let replacePromise: Promise<unknown> | null = null

    const TestComponent = () => {
      const { useApi } = require('../../hooks/useApi') as typeof import('../../hooks/useApi')
      const api = useApi()

      React.useEffect(() => {
        const file = new File(['updated'], 'demo.txt', { type: 'text/plain' })
        replacePromise = api.replaceFile('/files/demo.txt', file)
      }, [api])

      return null
    }

    render(<TestComponent />)

    await waitFor(() => expect(putMock).toHaveBeenCalled())

    const [url, body] = putMock.mock.calls[0] as [string, FormData]
    expect(url).toBe('/data/files/demo.txt')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('type')).toBe('binary')
    expect((body as FormData).get('file')).toBeInstanceOf(File)

    await replacePromise
  })

})
