import {
  PermissionAction,
  PermissionDecision,
  PermissionEvaluationRequest,
  PermissionMode,
  PermissionRule,
  PermissionRuleInput,
  WorkerEnv
} from '../types'
import { ApiError } from '../utils/response'
import {
  isActionPublic,
  matchPermissionPattern,
  normalizePermissionPath,
  permissionModeToAccess
} from './permissionMatcher'
import { PermissionRuleRepository } from './permissionRepository'

const DEFAULT_PERMISSION_MODE: PermissionMode = 'private_rw'

export class PermissionService {
  private repository: PermissionRuleRepository
  private initialized = false

  constructor(env: WorkerEnv, repository?: PermissionRuleRepository) {
    this.repository = repository || new PermissionRuleRepository(env)
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.repository.initialize()
    this.initialized = true
  }

  async listRules(filters: { enabled?: boolean; search?: string } = {}): Promise<PermissionRule[]> {
    await this.initialize()
    return this.repository.list(filters)
  }

  async createRule(input: PermissionRuleInput): Promise<PermissionRule> {
    await this.initialize()
    const validated = this.validateRuleInput(input)
    return this.repository.create(validated)
  }

  async updateRule(id: string, input: PermissionRuleInput): Promise<PermissionRule> {
    await this.initialize()
    const validated = this.validateRuleInput(input)
    return this.repository.update(id, validated)
  }

  async setRuleEnabled(id: string, enabled: boolean): Promise<PermissionRule> {
    await this.initialize()
    return this.repository.setEnabled(id, enabled)
  }

  async deleteRule(id: string): Promise<void> {
    await this.initialize()
    await this.repository.delete(id)
  }

  async evaluate(input: PermissionEvaluationRequest): Promise<PermissionDecision> {
    await this.initialize()
    this.validateEvaluationInput(input)

    const normalizedPath = normalizePermissionPath(input.path)
    const matchedRule = await this.findMatchingRule(normalizedPath)
    const mode = matchedRule?.mode || DEFAULT_PERMISSION_MODE
    const access = permissionModeToAccess(mode)

    return {
      path: normalizedPath,
      action: input.action,
      allowed: isActionPublic(mode, input.action),
      access: access[input.action],
      mode,
      matchedRule
    }
  }

  async assertAccess(pathname: string, action: PermissionAction): Promise<void> {
    const decision = await this.evaluate({ path: pathname, action })
    if (!decision.allowed) {
      const actionLabel = action === 'read' ? 'read' : 'write'
      throw ApiError.forbidden(`Path ${decision.path} requires private ${actionLabel} access`)
    }
  }

  private async findMatchingRule(pathname: string): Promise<PermissionRule | null> {
    const rules = await this.repository.list({ enabled: true })
    for (const rule of rules) {
      if (matchPermissionPattern(rule.pattern, pathname)) {
        return rule
      }
    }

    return null
  }

  private validateRuleInput(input: PermissionRuleInput): PermissionRuleInput {
    const pattern = normalizePermissionPath(input.pattern)
    if (pattern === '/') {
      throw ApiError.badRequest('Permission pattern cannot be root only')
    }

    if (!Number.isFinite(input.priority)) {
      throw ApiError.badRequest('Priority must be a valid number')
    }

    if (!this.isSupportedMode(input.mode)) {
      throw ApiError.badRequest('Unsupported permission mode')
    }

    return {
      pattern,
      mode: input.mode,
      priority: Math.trunc(input.priority),
      enabled: input.enabled !== false,
      description: input.description?.trim() || undefined
    }
  }

  private validateEvaluationInput(input: PermissionEvaluationRequest): void {
    if (!input.path || input.path.trim().length === 0) {
      throw ApiError.badRequest('Path is required')
    }

    if (input.action !== 'read' && input.action !== 'write') {
      throw ApiError.badRequest('Action must be read or write')
    }
  }

  private isSupportedMode(mode: string): mode is PermissionMode {
    return [
      'private_rw',
      'public_rw',
      'private_read_public_write',
      'public_read_private_write'
    ].includes(mode)
  }
}
