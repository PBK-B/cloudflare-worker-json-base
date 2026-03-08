import { WorkerEnv, PermissionRule, PermissionRuleInput } from '../types'
import { ApiError } from '../utils/response'
import { SystemDataAdapter } from '../system/systemDataAdapter'
import {
  getPermissionRuleRecordPath,
  PERMISSION_RULES_INDEX_PATH,
} from '../system/systemPaths'

interface PermissionRuleIndex {
  version: number
  updatedAt: string
  items: PermissionRule[]
}

interface LegacyPermissionRuleRow {
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
  private adapter: SystemDataAdapter
  private env: WorkerEnv
  private initialized = false

  constructor(env: WorkerEnv, adapter?: SystemDataAdapter) {
    this.env = env
    this.adapter = adapter || new SystemDataAdapter(env)
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const existingIndex = await this.adapter.getJson<PermissionRuleIndex>(PERMISSION_RULES_INDEX_PATH)
    if (!existingIndex) {
      await this.migrateLegacyRulesIfNeeded()
      const reloadedIndex = await this.adapter.getJson<PermissionRuleIndex>(PERMISSION_RULES_INDEX_PATH)
      if (!reloadedIndex) {
        await this.writeIndex(this.createEmptyIndex())
      }
    }

    this.initialized = true
  }

  async list(filters: { enabled?: boolean; search?: string } = {}): Promise<PermissionRule[]> {
    await this.initialize()
    const index = await this.loadIndex()

    let items = [...index.items]

    if (typeof filters.enabled === 'boolean') {
      items = items.filter((rule) => rule.enabled === filters.enabled)
    }

    if (filters.search) {
      const keyword = filters.search.toLowerCase()
      items = items.filter((rule) =>
        rule.pattern.toLowerCase().includes(keyword) ||
        (rule.description || '').toLowerCase().includes(keyword)
      )
    }

    return this.sortRules(items)
  }

  async getById(id: string): Promise<PermissionRule | null> {
    await this.initialize()

    const index = await this.loadIndex()
    const indexedRule = index.items.find((rule) => rule.id === id)
    if (indexedRule) {
      return indexedRule
    }

    return await this.adapter.getJson<PermissionRule>(getPermissionRuleRecordPath(id))
  }

  async create(input: PermissionRuleInput): Promise<PermissionRule> {
    await this.initialize()

    const now = new Date().toISOString()
    const rule: PermissionRule = {
      id: crypto.randomUUID(),
      pattern: input.pattern,
      mode: input.mode,
      priority: input.priority,
      enabled: input.enabled !== false,
      description: input.description || undefined,
      created_at: now,
      updated_at: now,
    }

    await this.adapter.setJson(getPermissionRuleRecordPath(rule.id), rule)

    const index = await this.loadIndex()
    index.items = this.sortRules([rule, ...index.items])
    index.updatedAt = now
    await this.writeIndex(index)

    return rule
  }

  async update(id: string, input: PermissionRuleInput): Promise<PermissionRule> {
    await this.initialize()

    const existing = await this.getById(id)
    if (!existing) {
      throw ApiError.notFound('Permission rule not found')
    }

    const updated: PermissionRule = {
      ...existing,
      pattern: input.pattern,
      mode: input.mode,
      priority: input.priority,
      enabled: input.enabled !== false,
      description: input.description || undefined,
      updated_at: new Date().toISOString(),
    }

    await this.adapter.setJson(getPermissionRuleRecordPath(id), updated)

    const index = await this.loadIndex()
    index.items = this.sortRules(index.items.map((rule) => (rule.id === id ? updated : rule)))
    index.updatedAt = updated.updated_at
    await this.writeIndex(index)

    return updated
  }

  async setEnabled(id: string, enabled: boolean): Promise<PermissionRule> {
    await this.initialize()

    const existing = await this.getById(id)
    if (!existing) {
      throw ApiError.notFound('Permission rule not found')
    }

    const updated: PermissionRule = {
      ...existing,
      enabled,
      updated_at: new Date().toISOString(),
    }

    await this.adapter.setJson(getPermissionRuleRecordPath(id), updated)

    const index = await this.loadIndex()
    index.items = this.sortRules(index.items.map((rule) => (rule.id === id ? updated : rule)))
    index.updatedAt = updated.updated_at
    await this.writeIndex(index)

    return updated
  }

  async delete(id: string): Promise<void> {
    await this.initialize()

    const existing = await this.getById(id)
    if (!existing) {
      throw ApiError.notFound('Permission rule not found')
    }

    await this.adapter.delete(getPermissionRuleRecordPath(id))

    const index = await this.loadIndex()
    index.items = index.items.filter((rule) => rule.id !== id)
    index.updatedAt = new Date().toISOString()
    await this.writeIndex(index)
  }

  private async loadIndex(): Promise<PermissionRuleIndex> {
    const index = await this.adapter.getJson<PermissionRuleIndex>(PERMISSION_RULES_INDEX_PATH)
    return index || this.createEmptyIndex()
  }

  private async writeIndex(index: PermissionRuleIndex): Promise<void> {
    await this.adapter.setJson(PERMISSION_RULES_INDEX_PATH, {
      ...index,
      items: this.sortRules(index.items),
    })
  }

  private createEmptyIndex(): PermissionRuleIndex {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    }
  }

  private sortRules(rules: PermissionRule[]): PermissionRule[] {
    return [...rules].sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority
      }

      const updatedDiff = new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      if (updatedDiff !== 0) {
        return updatedDiff
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    })
  }

  private async migrateLegacyRulesIfNeeded(): Promise<void> {
    const db = this.env.JSONBASE_DB
    if (!db) {
      return
    }

    try {
      const result = await db.prepare(`
        SELECT * FROM path_permission_rules
        ORDER BY priority DESC, updated_at DESC, created_at DESC
      `).all() as { results?: LegacyPermissionRuleRow[] }

      const legacyRules = (result.results || []).map((row) => this.legacyRowToRule(row))
      if (legacyRules.length === 0) {
        return
      }

      for (const rule of legacyRules) {
        await this.adapter.setJson(getPermissionRuleRecordPath(rule.id), rule)
      }

      await this.writeIndex({
        version: 1,
        updatedAt: new Date().toISOString(),
        items: legacyRules,
      })
    } catch {
      return
    }
  }

  private legacyRowToRule(row: LegacyPermissionRuleRow): PermissionRule {
    return {
      id: row.id,
      pattern: row.pattern,
      mode: row.mode,
      priority: row.priority,
      enabled: row.enabled === 1,
      description: row.description || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}
