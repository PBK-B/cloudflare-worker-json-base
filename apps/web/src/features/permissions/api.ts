import { apiRequest } from '../../shared/api/client';
import type { PermissionDecision, PermissionEvaluationRequest, PermissionRule, PermissionRuleInput, SharedApiResponse } from '../../types';

function toPermissionRule(rule: any): PermissionRule {
	return {
		id: rule.id,
		pattern: rule.pattern,
		mode: rule.mode,
		priority: rule.priority,
		enabled: rule.enabled,
		description: rule.description,
		created_at: rule.createdAt,
		updated_at: rule.updatedAt,
	};
}

function toPermissionDecision(decision: any): PermissionDecision {
	return {
		path: decision.path,
		action: decision.action,
		allowed: decision.allowed,
		access: decision.access,
		mode: decision.mode,
		matchedRule: decision.matchedRule ? toPermissionRule(decision.matchedRule) : null,
	};
}

const permissionApi = {
	async listPermissionRules(enabled?: boolean, search?: string): Promise<SharedApiResponse<{ items: PermissionRule[] }>> {
		const params = new URLSearchParams();
		if (typeof enabled === 'boolean') params.append('enabled', String(enabled));
		if (search) params.append('search', search);
		const response = await apiRequest<SharedApiResponse<{ items: any[] }>>(`/admin/permissions/rules${params.toString() ? `?${params.toString()}` : ''}`);

		return {
			...response,
			data: response.data ? { items: response.data.items.map(toPermissionRule) } : undefined,
		};
	},
	async createPermissionRule(data: PermissionRuleInput): Promise<SharedApiResponse<PermissionRule>> {
		const response = await apiRequest<SharedApiResponse<any>>('/admin/permissions/rules', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		});

		return { ...response, data: response.data ? toPermissionRule(response.data) : undefined };
	},
	async updatePermissionRule(id: string, data: PermissionRuleInput): Promise<SharedApiResponse<PermissionRule>> {
		const response = await apiRequest<SharedApiResponse<any>>(`/admin/permissions/rules/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		});

		return { ...response, data: response.data ? toPermissionRule(response.data) : undefined };
	},
	async setPermissionRuleStatus(id: string, enabled: boolean): Promise<SharedApiResponse<PermissionRule>> {
		const response = await apiRequest<SharedApiResponse<any>>(`/admin/permissions/rules/${id}/status`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ enabled }),
		});

		return { ...response, data: response.data ? toPermissionRule(response.data) : undefined };
	},
	async deletePermissionRule(id: string): Promise<SharedApiResponse<void>> {
		await apiRequest(`/admin/permissions/rules/${id}`, { method: 'DELETE' });
		return { success: true, timestamp: new Date().toISOString() };
	},
	async evaluatePermissionRule(data: PermissionEvaluationRequest): Promise<SharedApiResponse<PermissionDecision>> {
		const response = await apiRequest<SharedApiResponse<any>>('/admin/permissions/evaluate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		});

		return { ...response, data: response.data ? toPermissionDecision(response.data) : undefined };
	},
};

export function usePermissionApi() {
	return permissionApi;
}
