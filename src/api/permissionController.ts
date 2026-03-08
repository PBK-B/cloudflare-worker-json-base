import { ResponseBuilder, ApiError } from '../utils/response'
import { AuthMiddleware, Logger } from '../utils/middleware'
import {
  PermissionEvaluationRequest,
  PermissionRuleInput,
  WorkerEnv
} from '../types'
import { PermissionService } from '../permissions/permissionService'

export class PermissionController {
  private permissionService: PermissionService

  constructor(env: WorkerEnv) {
    ;(globalThis as any).ENV = env
    this.permissionService = new PermissionService(env)
    AuthMiddleware.initialize(env)
  }

  async list(request: Request): Promise<Response> {
    try {
      await AuthMiddleware.requireAuth(request)
      const url = new URL(request.url)
      const enabledParam = url.searchParams.get('enabled')
      const search = url.searchParams.get('search') || undefined
      const enabled = enabledParam === null ? undefined : enabledParam === 'true'
      const rules = await this.permissionService.listRules({ enabled, search })
      return ResponseBuilder.success({ items: rules }, 'Permission rules retrieved successfully')
    } catch (error) {
      Logger.error('Permission rule list failed', error)
      return this.handleError(error)
    }
  }

  async create(request: Request): Promise<Response> {
    try {
      await AuthMiddleware.requireAuth(request)
      const input = await this.parseRuleInput(request)
      const rule = await this.permissionService.createRule(input)
      return ResponseBuilder.created(rule, 'Permission rule created successfully')
    } catch (error) {
      Logger.error('Permission rule create failed', error)
      return this.handleError(error)
    }
  }

  async update(request: Request, id: string): Promise<Response> {
    try {
      await AuthMiddleware.requireAuth(request)
      const input = await this.parseRuleInput(request)
      const rule = await this.permissionService.updateRule(id, input)
      return ResponseBuilder.success(rule, 'Permission rule updated successfully')
    } catch (error) {
      Logger.error('Permission rule update failed', error)
      return this.handleError(error)
    }
  }

  async setStatus(request: Request, id: string): Promise<Response> {
    try {
      await AuthMiddleware.requireAuth(request)
      const body = await request.json() as { enabled?: boolean }
      if (typeof body.enabled !== 'boolean') {
        throw ApiError.badRequest('enabled must be a boolean')
      }

      const rule = await this.permissionService.setRuleEnabled(id, body.enabled)
      return ResponseBuilder.success(rule, 'Permission rule status updated successfully')
    } catch (error) {
      Logger.error('Permission rule status update failed', error)
      return this.handleError(error)
    }
  }

  async delete(request: Request, id: string): Promise<Response> {
    try {
      await AuthMiddleware.requireAuth(request)
      await this.permissionService.deleteRule(id)
      return ResponseBuilder.noContent()
    } catch (error) {
      Logger.error('Permission rule delete failed', error)
      return this.handleError(error)
    }
  }

  async evaluate(request: Request): Promise<Response> {
    try {
      await AuthMiddleware.requireAuth(request)
      const body = await request.json() as PermissionEvaluationRequest
      const decision = await this.permissionService.evaluate(body)
      return ResponseBuilder.success(decision, 'Permission rule evaluated successfully')
    } catch (error) {
      Logger.error('Permission rule evaluate failed', error)
      return this.handleError(error)
    }
  }

  private async parseRuleInput(request: Request): Promise<PermissionRuleInput> {
    const body = await request.json() as Partial<PermissionRuleInput>
    if (!body.pattern || !body.mode || typeof body.priority !== 'number') {
      throw ApiError.badRequest('pattern, mode, and priority are required')
    }

    return {
      pattern: body.pattern,
      mode: body.mode,
      priority: body.priority,
      enabled: body.enabled,
      description: body.description
    }
  }

  private handleError(error: unknown): Response {
    if (error instanceof ApiError) {
      return error.toResponse()
    }

    Logger.error('Unexpected permission controller error', error)
    return ApiError.internal('Internal server error').toResponse()
  }
}
