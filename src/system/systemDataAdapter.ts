import { D1Database } from '@cloudflare/workers-types'
import { WorkerEnv } from '../types'
import { ApiError } from '../utils/response'
import { Config } from '../utils/config'
import { isSystemPath } from './systemPaths'

interface SystemRecordRow {
  path: string
  value: string
  created_at: string
  updated_at: string
}

interface SystemDataBackendAdapter {
  getJson<T>(path: string): Promise<T | null>
  setJson<T>(path: string, value: T): Promise<void>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  listJson<T>(prefix: string): Promise<Array<{ path: string; value: T; created_at: string; updated_at: string }>>
}

export class SystemDataAdapter {
  private backend: SystemDataBackendAdapter

  constructor(env: WorkerEnv) {
    const config = Config.getInstance(env)
    this.backend = config.storageBackend === 'kv'
      ? new KVSystemDataAdapter(env)
      : new D1SystemDataAdapter(env)
  }

  async getJson<T>(path: string): Promise<T | null> {
    this.assertSystemPath(path)
    return await this.backend.getJson(path)
  }

  async setJson<T>(path: string, value: T): Promise<void> {
    this.assertSystemPath(path)
    await this.backend.setJson(path, value)
  }

  async delete(path: string): Promise<void> {
    this.assertSystemPath(path)
    await this.backend.delete(path)
  }

  async exists(path: string): Promise<boolean> {
    this.assertSystemPath(path)
    return await this.backend.exists(path)
  }

  async listJson<T>(prefix: string): Promise<Array<{ path: string; value: T; created_at: string; updated_at: string }>> {
    this.assertSystemPath(prefix)
    return await this.backend.listJson(prefix)
  }

  private assertSystemPath(path: string): void {
    if (!isSystemPath(path)) {
      throw ApiError.badRequest('System data path must be under /._system')
    }
  }
}

class D1SystemDataAdapter implements SystemDataBackendAdapter {
  private db: D1Database
  private initialized = false

  constructor(env: WorkerEnv) {
    const database = env.JSONBASE_DB
    if (!database) {
      throw ApiError.serviceUnavailable('D1 database not available')
    }

    this.db = database
  }

  async getJson<T>(path: string): Promise<T | null> {
    await this.initialize()

    const row = await this.db.prepare(`
      SELECT value FROM system_data_records WHERE path = ?
    `).bind(path).first() as { value: string } | null

    if (!row) {
      return null
    }

    return this.parseJson<T>(row.value, path)
  }

  async setJson<T>(path: string, value: T): Promise<void> {
    await this.initialize()

    const now = new Date().toISOString()
    const existing = await this.db.prepare(`
      SELECT created_at FROM system_data_records WHERE path = ?
    `).bind(path).first() as { created_at: string } | null

    await this.db.prepare(`
      INSERT OR REPLACE INTO system_data_records (path, value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      path,
      JSON.stringify(value),
      existing?.created_at || now,
      now
    ).run()
  }

  async delete(path: string): Promise<void> {
    await this.initialize()
    await this.db.prepare(`DELETE FROM system_data_records WHERE path = ?`).bind(path).run()
  }

  async exists(path: string): Promise<boolean> {
    await this.initialize()

    const row = await this.db.prepare(`
      SELECT 1 as present FROM system_data_records WHERE path = ?
    `).bind(path).first() as { present: number } | null

    return Boolean(row?.present)
  }

  async listJson<T>(prefix: string): Promise<Array<{ path: string; value: T; created_at: string; updated_at: string }>> {
    await this.initialize()

    const result = await this.db.prepare(`
      SELECT path, value, created_at, updated_at
      FROM system_data_records
      WHERE path = ? OR path LIKE ?
      ORDER BY updated_at DESC
    `).bind(prefix, `${prefix}/%`).all() as { results?: SystemRecordRow[] }

    return (result.results || []).map((row) => ({
      path: row.path,
      value: this.parseJson<T>(row.value, row.path),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS system_data_records (
        path TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run()

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_system_data_records_updated_at
      ON system_data_records(updated_at DESC)
    `).run()

    this.initialized = true
  }

  private parseJson<T>(raw: string, path: string): T {
    try {
      return JSON.parse(raw) as T
    } catch {
      throw ApiError.internal(`System data at ${path} is not valid JSON`)
    }
  }
}

class KVSystemDataAdapter implements SystemDataBackendAdapter {
  private kv: KVNamespace

  constructor(env: WorkerEnv) {
    const namespace = env.JSONBIN || env.JSONBIN_PREVIEW
    if (!namespace) {
      throw ApiError.serviceUnavailable('KV namespace not available')
    }

    this.kv = namespace
  }

  async getJson<T>(path: string): Promise<T | null> {
    const raw = await this.kv.get(this.dataKey(path))
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as T
    } catch {
      throw ApiError.internal(`System data at ${path} is not valid JSON`)
    }
  }

  async setJson<T>(path: string, value: T): Promise<void> {
    const now = new Date().toISOString()
    const existing = await this.getMetadata(path)
    const metadata = {
      path,
      created_at: existing?.created_at || now,
      updated_at: now,
    }

    await this.kv.put(this.dataKey(path), JSON.stringify(value), {
    })
    await this.kv.put(this.metaKey(path), JSON.stringify(metadata))
  }

  async delete(path: string): Promise<void> {
    await this.kv.delete(this.dataKey(path))
    await this.kv.delete(this.metaKey(path))
  }

  async exists(path: string): Promise<boolean> {
    return Boolean(await this.kv.get(this.metaKey(path)))
  }

  async listJson<T>(prefix: string): Promise<Array<{ path: string; value: T; created_at: string; updated_at: string }>> {
    const list = await this.kv.list({ prefix: this.metaKey(prefix) })
    const items: Array<{ path: string; value: T; created_at: string; updated_at: string }> = []

    for (const key of list.keys) {
      const metadataRaw = await this.kv.get(key.name)
      if (!metadataRaw) {
        continue
      }

      const metadata = JSON.parse(metadataRaw) as { path: string; created_at: string; updated_at: string }
      const value = await this.getJson<T>(metadata.path)
      if (value === null) {
        continue
      }

      items.push({
        path: metadata.path,
        value,
        created_at: metadata.created_at,
        updated_at: metadata.updated_at,
      })
    }

    return items.sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
  }

  private async getMetadata(path: string): Promise<{ path: string; created_at: string; updated_at: string } | null> {
    const raw = await this.kv.get(this.metaKey(path))
    return raw ? JSON.parse(raw) : null
  }

  private dataKey(path: string): string {
    return `system:data:${path}`
  }

  private metaKey(path: string): string {
    return `system:meta:${path}`
  }
}

export default SystemDataAdapter
