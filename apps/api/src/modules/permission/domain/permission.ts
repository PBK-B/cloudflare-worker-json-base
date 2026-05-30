import type { PermissionAction, PermissionMode } from './permissionMatcher';

export interface PermissionRuleRecord {
	id: string;
	pattern: string;
	mode: PermissionMode;
	priority: number;
	enabled: boolean;
	description?: string;
	createdAt: string;
	updatedAt: string;
}

export interface PermissionDecisionRecord {
	path: string;
	action: PermissionAction;
	allowed: boolean;
	access: 'public' | 'private';
	mode: PermissionMode;
	matchedRule: PermissionRuleRecord | null;
}
