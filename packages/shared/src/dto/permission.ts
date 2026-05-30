export type PermissionMode =
	| 'private_rw'
	| 'public_rw'
	| 'private_read_public_write'
	| 'public_read_private_write';

export type PermissionAction = 'read' | 'write';

export interface PermissionRuleDto {
	id: string;
	pattern: string;
	mode: PermissionMode;
	priority: number;
	enabled: boolean;
	description?: string;
	createdAt: string;
	updatedAt: string;
}

export interface PermissionRuleInputDto {
	pattern: string;
	mode: PermissionMode;
	priority: number;
	enabled?: boolean;
	description?: string;
}

export interface PermissionDecisionDto {
	path: string;
	action: PermissionAction;
	allowed: boolean;
	access: 'public' | 'private';
	mode: PermissionMode;
	matchedRule: PermissionRuleDto | null;
}

export interface PermissionEvaluationRequestDto {
	path: string;
	action: PermissionAction;
}
