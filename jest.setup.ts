import '@testing-library/jest-dom'
import { jest } from '@jest/globals'

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder
}

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    clear: jest.fn(),
    removeItem: jest.fn(),
  },
  writable: true,
})

global.Request = class Request {
  url: string
  method: string
  headers: Headers
  body: any
  bodyUsed: boolean

  constructor(url: string, options: RequestInit = {}) {
    this.url = url
    this.method = options.method || 'GET'
    this.headers = new Headers(options.headers as any)
    this.body = options.body
    this.bodyUsed = false
  }

  async json(): Promise<any> {
    this.bodyUsed = true
    if (typeof this.body === 'string') {
      return JSON.parse(this.body)
    }
    return this.body
  }

  async text(): Promise<string> {
    this.bodyUsed = true
    return typeof this.body === 'string' ? this.body : String(this.body)
  }

  async formData(): Promise<FormData> {
    this.bodyUsed = true
    if (this.body instanceof FormData) {
      return this.body
    }
    throw new Error('FormData not supported in this context')
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    this.bodyUsed = true
    const encoder = new TextEncoder()
    return Promise.resolve(encoder.encode(String(this.body)).buffer)
  }
} as any

global.Response = class Response {
  status: number
  statusText: string
  headers: Headers
  body: any
  url: string

  constructor(body: any, options: ResponseInit = {}) {
    this.body = body
    this.status = options.status || 200
    this.statusText = options.statusText || 'OK'
    this.headers = new Headers(options.headers as any)
    this.url = ''
  }

  async json(): Promise<any> {
    if (typeof this.body === 'string') {
      return JSON.parse(this.body)
    }
    return this.body
  }

  async text(): Promise<string> {
    return typeof this.body === 'string' ? this.body : String(this.body)
  }
} as any

global.Headers = class Headers {
  private store: Map<string, string> = new Map()

  constructor(init?: HeadersInit) {
    if (init) {
      if (Array.isArray(init)) {
        init.forEach(([key, value]) => this.store.set(key.toLowerCase(), value))
      } else {
        Object.entries(init).forEach(([key, value]) => this.store.set(key.toLowerCase(), value))
      }
    }
  }

  get(name: string): string | null {
    return this.store.get(name.toLowerCase()) || null
  }

  set(name: string, value: string): void {
    this.store.set(name.toLowerCase(), value)
  }

  has(name: string): boolean {
    return this.store.has(name.toLowerCase())
  }

  delete(name: string): boolean {
    return this.store.delete(name.toLowerCase())
  }

  append(name: string, value: string): void {
    this.store.set(name.toLowerCase(), value)
  }
} as any
