import type {
	ApiResponse,
	PaginatedResponse,
	PermissionDecisionDto,
	PermissionEvaluationRequestDto,
	PermissionMode,
	PermissionRuleDto,
	PermissionRuleInputDto,
	ResourceDto,
	ResourceType,
} from '@jsonbase/shared';

export type StorageData = {
	id: string;
	path: string;
	value?: unknown;
	type: ResourceType;
	created_at: string;
	updated_at: string;
	size: number;
	content_type?: string;
	storage_location?: 'd1' | 'kv';
	downloadable?: boolean;
	downloadPath?: string;
};

export type PermissionAction = 'read' | 'write';
export type { PermissionMode };
export type PermissionRule = {
	id: string;
	pattern: string;
	mode: PermissionMode;
	priority: number;
	enabled: boolean;
	description?: string;
	created_at: string;
	updated_at: string;
};

export type PermissionDecision = {
	path: string;
	action: PermissionAction;
	allowed: boolean;
	access: 'public' | 'private';
	mode: PermissionMode;
	matchedRule: PermissionRule | null;
};

export type PermissionRuleInput = {
	pattern: string;
	mode: PermissionMode;
	priority: number;
	enabled?: boolean;
	description?: string;
};

export type PermissionEvaluationRequest = PermissionEvaluationRequestDto;
export type CreateDataRequest = { value: unknown; type?: ResourceType; content_type?: string };
export type UpdateDataRequest = { value: unknown; type?: ResourceType; content_type?: string };
export type ConsoleStats = {
	totalCount: number;
	totalSize: number;
	pageCount: number;
	totalFiles?: number;
	storageBackend: string;
	environment: string;
	version: string;
};

export type ConsoleInfo = {
	name: string;
	version: string;
	endpoints: Record<string, string>;
	features: string[];
	timestamp: string;
};

export type SharedApiResponse<T = unknown> = ApiResponse<T>;
export type SharedPaginatedResponse<T> = PaginatedResponse<T>;
export type SharedResourceDto = ResourceDto;
export type SharedPermissionRuleDto = PermissionRuleDto;
export type SharedPermissionDecisionDto = PermissionDecisionDto;
export type SharedPermissionRuleInputDto = PermissionRuleInputDto;
export type { ApiResponse };
