import type { PermissionDecisionDto, PermissionRuleDto, PermissionRuleInputDto } from '@jsonbase/shared';
import { AppError } from '../../../shared/errors/appError';
import type { PermissionDecisionRecord, PermissionRuleRecord } from '../domain/permission';
import type { PermissionRuleRepository } from '../domain/permissionRepository';
import {
	isActionPublic,
	matchPermissionPattern,
	normalizePermissionPath,
	permissionModeToAccess,
	type PermissionAction,
	type PermissionMode
} from '../domain/permissionMatcher';

const DEFAULT_PERMISSION_MODE: PermissionMode = 'private_rw';

export class PermissionService {
	constructor(private readonly repository: PermissionRuleRepository) {}

	async initialize(): Promise<void> {
		await this.repository.initialize();
	}

	async listRules(filters: { enabled?: boolean; search?: string } = {}): Promise<PermissionRuleDto[]> {
		await this.initialize();
		const rules = await this.repository.list(filters);
		return rules.map((rule) => toRuleDto(rule));
	}

	async createRule(input: PermissionRuleInputDto): Promise<PermissionRuleDto> {
		await this.initialize();
		const validated = validateRuleInput(input);
		return toRuleDto(await this.repository.create(validated));
	}

	async updateRule(id: string, input: PermissionRuleInputDto): Promise<PermissionRuleDto> {
		await this.initialize();
		const validated = validateRuleInput(input);
		return toRuleDto(await this.repository.update(id, validated));
	}

	async setRuleEnabled(id: string, enabled: boolean): Promise<PermissionRuleDto> {
		await this.initialize();
		return toRuleDto(await this.repository.setEnabled(id, enabled));
	}

	async deleteRule(id: string): Promise<void> {
		await this.initialize();
		await this.repository.delete(id);
	}

	async evaluate(input: { path: string; action: PermissionAction }): Promise<PermissionDecisionDto> {
		await this.initialize();
		const decision = await this.evaluateInternal(input.path, input.action);
		return toDecisionDto(decision);
	}

	async requiresAuthentication(path: string, action: PermissionAction): Promise<boolean> {
		await this.initialize();
		const decision = await this.evaluateInternal(path, action);
		return !decision.allowed;
	}

	private async evaluateInternal(path: string, action: PermissionAction): Promise<PermissionDecisionRecord> {
		if (action !== 'read' && action !== 'write') {
			throw AppError.badRequest('Action must be read or write');
		}

		const normalizedPath = normalizePermissionPath(path);
		const rules = await this.repository.list({ enabled: true });
		const matchedRule = rules.find((rule) => matchPermissionPattern(rule.pattern, normalizedPath)) || null;
		const mode = matchedRule?.mode || DEFAULT_PERMISSION_MODE;
		const access = permissionModeToAccess(mode);

		return {
			path: normalizedPath,
			action,
			allowed: isActionPublic(mode, action),
			access: access[action],
			mode,
			matchedRule
		};
	}
}

function validateRuleInput(input: PermissionRuleInputDto): PermissionRuleInputDto {
	const pattern = normalizePermissionPath(input.pattern);
	if (pattern === '/') {
		throw AppError.badRequest('Permission pattern cannot be root only');
	}

	if (!Number.isFinite(input.priority)) {
		throw AppError.badRequest('Priority must be a valid number');
	}

	if (!['private_rw', 'public_rw', 'private_read_public_write', 'public_read_private_write'].includes(input.mode)) {
		throw AppError.badRequest('Unsupported permission mode');
	}

	return {
		pattern,
		mode: input.mode,
		priority: Math.trunc(input.priority),
		enabled: input.enabled !== false,
		description: input.description?.trim() || undefined
	};
}

function toRuleDto(rule: PermissionRuleRecord): PermissionRuleDto {
	return {
		id: rule.id,
		pattern: rule.pattern,
		mode: rule.mode,
		priority: rule.priority,
		enabled: rule.enabled,
		description: rule.description,
		createdAt: rule.createdAt,
		updatedAt: rule.updatedAt
	};
}

function toDecisionDto(decision: PermissionDecisionRecord): PermissionDecisionDto {
	return {
		path: decision.path,
		action: decision.action,
		allowed: decision.allowed,
		access: decision.access,
		mode: decision.mode,
		matchedRule: decision.matchedRule ? toRuleDto(decision.matchedRule) : null
	};
}
