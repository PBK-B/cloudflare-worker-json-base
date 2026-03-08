import { D1Database } from '@cloudflare/workers-types'
import { WorkerEnv, PermissionRule, PermissionRuleInput } from '../types'
import { ApiError } from '../utils/response'

interface PermissionRuleRow {
  id: string
  pattern: string
  mode: PermissionRule['mode']
  priority: number
  enabled: number
  description: string | null
  created_at: string
  updated_at: string
}

export class PermissionRuleRepository {
  private db: D1Database

  constructor(env: WorkerEnv) {
    this.db = env.JSONBASE_DB

    if (!this.db) {
      throw ApiError.serviceUnavailable('D1 database not available')
    }
  }

  async initialize(): Promise<void> {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS path_permission_rules (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        mode TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run()

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_path_permission_rules_priority
      ON path_permission_rules(priority DESC, updated_at DESC)
    `).run()

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_path_permission_rules_enabled
      ON path_permission_rules(enabled)
    `).run()
  }

  async list(filters: { enabled?: boolean; search?: string } = {}): Promise<PermissionRule[]> {
    const conditions: string[] = []
    const values: Array<string | number> = []

    if (typeof filters.enabled === 'boolean') {
      conditions.push('enabled = ?')
      values.push(filters.enabled ? 1 : 0)
    }

    if (filters.search) {
      conditions.push('(pattern LIKE ? OR COALESCE(description, \"\") LIKE ?)')
      values.push(`%${filters.search}%`, `%${filters.search}%`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await this.db.prepare(`
      SELECT * FROM path_permission_rules
      ${whereClause}
      ORDER BY priority DESC, updated_at DESC, created_at DESC
    `).bind(...values).all() as { results?: PermissionRuleRow[] }

    return (result.results || []).map((row) => this.rowToRule(row))
  }

  async getById(id: string): Promise<PermissionRule | null> {
    const row = await this.db.prepare(`
      SELECT * FROM path_permission_rules WHERE id = ?
    `).bind(id).first() as PermissionRuleRow | null

    return row ? this.rowToRule(row) : null
  }

  async create(input: PermissionRuleInput): Promise<PermissionRule> {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    await this.db.prepare(`
      INSERT INTO path_permission_rules (id, pattern, mode, priority, enabled, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.pattern,
      input.mode,
      input.priority,
      input.enabled === false ? 0 : 1,
      input.description || null,
      now,
      now
    ).run()

    const created = await this.getById(id)
    if (!created) {
      throw ApiError.internal('Failed to create permission rule')
    }

    return created
  }

  async update(id: string, input: PermissionRuleInput): Promise<PermissionRule> {
    const now = new Date().toISOString()
    const existing = await this.getById(id)
    if (!existing) {
      throw ApiError.notFound('Permission rule not found')
    }

    await this.db.prepare(`
      UPDATE path_permission_rules
      SET pattern = ?, mode = ?, priority = ?, enabled = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      input.pattern,
      input.mode,
      input.priority,
      input.enabled === false ? 0 : 1,
      input.description || null,
      now,
      id
    ).run()

    const updated = await this.getById(id)
    if (!updated) {
      throw ApiError.internal('Failed to update permission rule')
    }

    return updated
  }

  async setEnabled(id: string, enabled: boolean): Promise<PermissionRule> {
    const existing = await this.getById(id)
    if (!existing) {
      throw ApiError.notFound('Permission rule not found')
    }

    await this.db.prepare(`
      UPDATE path_permission_rules
      SET enabled = ?, updated_at = ?
      WHERE id = ?
    `).bind(enabled ? 1 : 0, new Date().toISOString(), id).run()

    const updated = await this.getById(id)
    if (!updated) {
      throw ApiError.internal('Failed to update permission rule status')
    }

    return updated
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.prepare(`
      DELETE FROM path_permission_rules WHERE id = ?
    `).bind(id).run()

    if ((result as { changes?: number }).changes === 0) {
      throw ApiError.notFound('Permission rule not found')
    }
  }

  private rowToRule(row: PermissionRuleRow): PermissionRule {
    return {
      id: row.id,
      pattern: row.pattern,
      mode: row.mode,
      priority: row.priority,
      enabled: row.enabled === 1,
      description: row.description || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }
}
