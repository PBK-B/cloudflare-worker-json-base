import { StoredData, StorageAdapter } from '../storage/storageAdapter'
import { WorkerEnv } from '../types'
import { ApiError } from '../utils/response'
import { isSystemPath } from './systemPaths'

export class SystemDataAdapter {
  private storageAdapter: StorageAdapter

  constructor(env: WorkerEnv, storageAdapter?: StorageAdapter) {
    this.storageAdapter = storageAdapter || new StorageAdapter({ env })
  }

  async getJson<T>(path: string): Promise<T | null> {
    this.assertSystemPath(path)

    try {
      const stored = await this.storageAdapter.get(path)
      return this.parseStoredJson<T>(stored)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return null
      }

      throw error
    }
  }

  async setJson<T>(path: string, value: T): Promise<void> {
    this.assertSystemPath(path)
    await this.storageAdapter.upsert(path, {
      value,
      type: 'json',
      content_type: 'application/json',
    })
  }

  async delete(path: string): Promise<void> {
    this.assertSystemPath(path)

    try {
      await this.storageAdapter.delete(path)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return
      }

      throw error
    }
  }

  async exists(path: string): Promise<boolean> {
    this.assertSystemPath(path)
    return (await this.getJson(path)) !== null
  }

  private assertSystemPath(path: string): void {
    if (!isSystemPath(path)) {
      throw ApiError.badRequest('System data path must be under /._system')
    }
  }

  private parseStoredJson<T>(stored: StoredData): T {
    if (stored.type === 'json') {
      if (typeof stored.value === 'string') {
        return JSON.parse(stored.value) as T
      }

      return stored.value as T
    }

    if (typeof stored.value === 'string') {
      return JSON.parse(stored.value) as T
    }

    throw ApiError.internal('System data must be valid JSON')
  }
}

export default SystemDataAdapter
